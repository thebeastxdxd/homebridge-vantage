var net = require('net');
var sprintf = require("sprintf-js").sprintf, inherits = require("util").inherits, Promise = require('promise');
var parser = require('xml2json'), libxmljs = require("libxmljs"), sleep = require('sleep');
var extend = require('extend'), events = require('events'), util = require('util'), fs = require('fs');
var Accessory, Characteristic, Service, UUIDGen;

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

	inherits(VantageLoad, Accessory);
	process.setMaxListeners(0);
	homebridge.registerPlatform("VantageControls", VantagePlatform);
};

class VantageInfusion {
    constructor(ipaddress, accessories, usecache) {
		util.inherits(VantageInfusion, events.EventEmitter);
        this.ipaddress = ipaddress;
        this.usecache = usecache || true;
        this.accessories = accessories || [];
        this.command = {};
		this.interfaces = {};
		this.StartCommand();
	}

	/**
	 * Start the command session. The InFusion controller (starting from the 3.2 version of the
	 * firmware) must be configured without encryption or password protection. Support to SSL
	 * and password protected connection will be introduced in the future, the IoT world is
	 * a bad place! 
	 */
	StartCommand() {
		this.command = net.connect({ host: this.ipaddress, port: 3001 }, () => {
			this.command.on('data', (data) => {
				/* Data received */
				var lines = data.toString().split('\n');
				for (var i = 0; i < lines.length; i++) {
					var dataItem = lines[i].split(" ");
					if (lines[i].startsWith("S:LOAD ") || lines[i].startsWith("R:GETLOAD ")) {
						/* Live update about load level (even if it's a RGB load') */
						this.emit("loadStatusChange", parseInt(dataItem[1]),parseInt(dataItem[2]));
					}

					
					/* Outdoor temperature */
					if (lines[i].startsWith("EL: ") && dataItem[3] == "Thermostat.SetOutdoorTemperatureSW")
						this.emit(sprintf("thermostatOutdoorTemperatureChange"), parseInt(dataItem[2]),parseFloat(dataItem[4]/1000));
					if (lines[i].startsWith("R:INVOKE") && dataItem[3] == "Thermostat.GetOutdoorTemperature")
						this.emit(sprintf("thermostatOutdoorTemperatureChange"), parseInt(dataItem[1]),parseFloat(dataItem[2]));
				
					if (lines[i].startsWith("EL: ") && dataItem[3] == "Thermostat.SetIndoorTemperatureSW")
						this.emit(sprintf("thermostatIndoorTemperatureChange"), parseInt(dataItem[2]),parseFloat(dataItem[4]/1000));


					/* Non-state feedback */
					if (lines[i].startsWith("R:INVOKE") && lines[i].indexOf("Object.IsInterfaceSupported")) {
						this.emit(sprintf("isInterfaceSupportedAnswer-%d-%d",parseInt(dataItem[1]),parseInt(dataItem[4])),parseInt(dataItem[2]));
					}
				}
			});			

			this.command.write(sprintf("STATUS ALL\n"));
			this.command.write(sprintf("ELENABLE 1 AUTOMATION ON\nELENABLE 1 EVENT ON\nELENABLE 1 STATUS ON\nELENABLE 1 STATUSEX ON\nELENABLE 1 SYSTEM ON\nELLOG AUTOMATION ON\nELLOG EVENT ON\nELLOG STATUS ON\nELLOG STATUSEX ON\nELLOG SYSTEM ON\n"));
		});
	}

	getLoadStatus(vid) {
		this.command.write(sprintf("GETLOAD %s\n", vid));
	}

	/**
	 * Send the IsInterfaceSupported request to the InFusion controller,
	 * it needs the VID of the object and the IID (InterfaceId) taken 
	 * previously with the configuration session
	 * @return true, false or a promise!
	 */
	isInterfaceSupported(item, interfaceName) {
		if (this.interfaces[interfaceName] === undefined) {
			return new Promise((resolve, reject) => {
				resolve({'item': item, 'interface': interfaceName, 'support':false});
			});
		} else {
			/**
			 * Sample
			 *   OUT| INVOKE 2774 Object.IsInterfaceSupported 32
			 *    IN| R:INVOKE 2774 0 Object.IsInterfaceSupported 32
			 */
			var interfaceId = this.interfaces[interfaceName];
			
			return new Promise((resolve, reject) => {
				this.once(sprintf("isInterfaceSupportedAnswer-%d-%d",parseInt(item.VID),parseInt(interfaceId)), (_support) => {
					resolve({'item': item, 'interface': interfaceName, 'support':_support});
				}
				);
				sleep.usleep(5000);
				this.command.write(sprintf("INVOKE %s Object.IsInterfaceSupported %s\n", item.VID,interfaceId));
			});
		}
	}	

	/**
	 * Start the discovery procedure that use the local cache or download from the InFusion controller
	 * the last configuration saved on the SD card (usually the developer save a backup copy of the configuration
	 * on this support but in some cases it can be different from the current running configuration, I need to
	 * check how to download it with a single pass procedure)
	 */
	Discover() {
		var configuration = net.connect({ host: this.ipaddress, port: 2001 }, () => {
			/**
			 * List interfaces, list configuration and then check if a specific interface 
			 * is supported by the recognized devices. 
			 */

			var buffer = "";
			configuration.on('data', (data) => {
				buffer = buffer + data.toString().replace("\ufeff", "");
				try {
					buffer = buffer.replace('<?File Encode="Base64" /', '<File>');
					buffer = buffer.replace('?>', '</File>');
					libxmljs.parseXml(buffer);
				} catch (e) {
					return false;
				}
				var parsed = JSON.parse(parser.toJson(buffer));
				if (parsed.IIntrospection !== undefined) {
					var interfaces = parsed.IIntrospection.GetInterfaces.return.Interface;
					for (var i = 0; i < interfaces.length; i++) {
						this.interfaces[interfaces[i].Name] = interfaces[i].IID;
					}
				}
				if (parsed.IBackup !== undefined) {
					var xmlconfiguration = Buffer.from(parsed.IBackup.GetFile.return.File, 'base64').toString("ascii"); // Ta-da
					fs.writeFileSync("/tmp/vantage.dc", xmlconfiguration); /* TODO: create a platform-independent temp file */
					this.emit("endDownloadConfiguration", xmlconfiguration);
					configuration.destroy();
				} else {
					fs.readFile('/tmp/vantage.dc', 'utf8', function (err, data) {
						if(!err) {
							this.emit("endDownloadConfiguration", data);
						}
					}.bind(this))
				}

				buffer = "";
			});

			/* Aehm, async method becomes sync... */
			configuration.write("<IIntrospection><GetInterfaces><call></call></GetInterfaces></IIntrospection>\n");

			if (!fs.existsSync('/tmp/vantage.dc')) {
				configuration.write("<IBackup><GetFile><call>Backup\\Project.dc</call></GetFile></IBackup>\n");
			}
		});
	}

	/**
	 * Send the set HSL color request to the controller 
	 */
    RGBLoad_DissolveHSL(vid, h, s, l, time) {
        var thisTime = time || 500;
        this.command.write(sprintf("INVOKE %s RGBLoad.DissolveHSL %s %s %s %s\n", vid, h, s, l * 1000, thisTime))
    }

    Thermostat_GetOutdoorTemperature(vid) {
        this.command.write(sprintf("INVOKE %s Thermostat.GetOutdoorTemperature\n", vid))
    }


	/**
	 * Send the set light level to the controller
	 */
    Load_Dim(vid, level, time) {
		// TODO: reduce feedback (or command) rate
		var thisTime = time || 1;
		if (level > 0) {
			this.command.write(sprintf("INVOKE %s Load.Ramp 6 %s %s\n", vid, thisTime, level));
		} else {
			this.command.write(sprintf("INVOKE %s Load.SetLevel %s\n", vid, level));
		}
    }
}


class VantagePlatform {

	constructor(log, config, api) {
		this.log = log;
		this.config = config || {};
		this.api = api;
		this.ipaddress = config.ipaddress;
		this.lastDiscovery = null;
		this.items = [];
		this.accessories  = [];
		this.infusion = new VantageInfusion(config.ipaddress, this.items, false);
		this.infusion.Discover();
		this.pendingrequests = 0;
		this.ready = false;
		this.callbackPromesedAccessories = undefined;
		this.getAccessoryCallback = null;

		api.on('didFinishLaunching', () => {
			const uuid = UUIDGen.generate('8581');

			if (!this.accessories.find(accessory => accessory.UUID == uuid)) {

				// create a new accessory
				const accessory = new this.api.platformAccessory('VantageAccessory', uuid);

				api.registerPlatformAccessories("homebridge-vantage", "VantageControls", [accessory]);
			}
		});

		this.log.info("VantagePlatform for InFusion Controller at " + this.ipaddress);

		this.infusion.on('loadStatusChange', (vid,value) => {
			this.items.forEach(function (accessory) {
				if (accessory.address == vid) {
					this.log.debug(sprintf("loadStatusChange (VID=%s, Name=%s, Bri:%d)", vid,accessory.name, value));
					accessory.bri = parseInt(value);
					accessory.power = ((accessory.bri) > 0);
					if (accessory.lightBulbService !== undefined) {
						/* Is it ready? */
						accessory.lightBulbService.getCharacteristic(Characteristic.On).getValue(null, accessory.power);
						if (accessory.type == "rgb" || accessory.type == "dimmer") {
							accessory.lightBulbService.getCharacteristic(Characteristic.Brightness).getValue(null, accessory.bri);
						}
					}
				}
			}.bind(this));
		});

		this.infusion.on('thermostatOutdoorTemperatureChange', (vid,value) => {
			this.items.forEach(function (accessory) {
				if (accessory.address == vid) {
					accessory.temperature = parseFloat(value);
					if (accessory.thermostatService !== undefined) {
						/* Is it ready? */
						accessory.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).getValue(null, accessory.temperature);
					}
				}
			}.bind(this));
		});		

		this.infusion.on('thermostatIndoorTemperatureChange', (vid,value) => {
			this.items.forEach(function (accessory) {
				if (accessory.address == vid) {
					accessory.temperature = parseFloat(value);
					if (accessory.thermostatService !== undefined) {
						/* Is it ready? */
						accessory.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).getValue(null, accessory.temperature);
					}
				}
			}.bind(this));
		});	

		this.infusion.on('endDownloadConfiguration', (configuration) => {
			this.log.debug("VantagePlatform for InFusion Controller (end configuration download)");
			var parsed = JSON.parse(parser.toJson(configuration));
			for (var i = 0; i < parsed.Project.Objects.Object.length; i++) {
				var thisItemKey = Object.keys(parsed.Project.Objects.Object[i])[0];
				var thisItem = parsed.Project.Objects.Object[i][thisItemKey];
				if (thisItem.ExcludeFromWidgets === undefined || thisItem.ExcludeFromWidgets == "False") {
					if (thisItem.ObjectType == "HVAC") {
						if (thisItem.DName !== undefined && thisItem.DName != "") thisItem.Name = thisItem.DName;
						this.pendingrequests = this.pendingrequests + 1;
						this.log(sprintf("New HVAC asked (VID=%s, Name=%s, ---)", thisItem.VID, thisItem.Name));
						this.infusion.isInterfaceSupported(thisItem,"Thermostat").then((_response) => {
							if (_response.support) {
								this.log.debug(sprintf("New HVAC added (VID=%s, Name=%s, THERMOSTAT)", _response.item.Name, _response.item.VID));
								var item = new VantageThermostat(this.log, this, _response.item.Name, _response.item.VID, "thermostat");
								this.items.push(item);
								this.pendingrequests = this.pendingrequests - 1;
								this.callbackPromesedAccessoriesDo(item, "thermostat");
							} else {
								this.pendingrequests = this.pendingrequests - 1;
								//this.callbackPromesedAccessoriesDo();
							}
						});

					}
					if (thisItem.ObjectType == "Load") {
						//if (thisItem.DName !== undefined && thisItem.DName != "") thisItem.Name = thisItem.DName;
						this.pendingrequests = this.pendingrequests + 1;
						this.log.info(sprintf("New load asked (VID=%s, Name=%s, ---)", thisItem.VID, thisItem.Name));
						thisItem.Area = this.getAreaName(parsed.Project.Objects.Object, thisItem.Area);
						this.infusion.isInterfaceSupported(thisItem,"Load").then((_response) => {
							if (_response.support) {
								var name = sprintf("%s-%s",_response.item.Area, _response.item.Name)
								if (!_response.item.LoadType.includes("Relay") && !_response.item.LoadType.includes("Motor")) {
									/* Check if it is a Dimmer or a RGB Load */
									this.log.debug(sprintf("New load added (VID=%s, Name=%s, DIMMER)", _response.item.VID, name));
									var item = new VantageLoad(this.log, this, name, _response.item.VID, "dimmer");
									this.items.push(item);
									this.pendingrequests = this.pendingrequests - 1;
									this.callbackPromesedAccessoriesDo(item, "dimmer");
								} else {
									this.log.debug(sprintf("New load added (VID=%s, Name=%s, RELAY)", _response.item.VID, name));
									var item = new VantageLoad(this.log, this, name, _response.item.VID, "relay");
									this.items.push(item);
									this.pendingrequests = this.pendingrequests - 1;
									this.callbackPromesedAccessoriesDo(item, "relay");
								}
							} else {
								/**
								 * This is not a valid load
								 */
								this.pendingrequests = this.pendingrequests - 1;
								//this.callbackPromesedAccessoriesDo();
							}
						});
					}
				}
			}
			this.log.warn("VantagePlatform for InFusion Controller (end configuration store)");
			this.ready = true;
			//this.callbackPromesedAccessoriesDo();
		});
	}

	createHapAccessory(accessoryInstance, displayName, accessoryType, uuidBase) {
		 const services = (accessoryInstance.getServices() || [])
      .filter(service => !!service); // filter out undefined values; a common mistake
    const controllers = (accessoryInstance.getControllers && accessoryInstance.getControllers() || [])
      .filter(controller => !!controller);

    if (services.length === 0 && controllers.length === 0) { // check that we only add valid accessory with at least one service
      return undefined;
    }

    if (!(services[0] instanceof Service)) {
      // The returned "services" for this accessory is assumed to be the old style: a big array
      // of JSON-style objects that will need to be parsed by HAP-NodeJS's AccessoryLoader.

      return AccessoryLoader.parseAccessoryJSON({ // Create the actual HAP-NodeJS "Accessory" instance
        displayName: displayName,
        services: services,
      });
    } else {
      // The returned "services" for this accessory are simply an array of new-API-style
      // Service instances which we can add to a created HAP-NodeJS Accessory directly.
      const accessoryUUID = UUIDGen.generate(accessoryType + ":" + (uuidBase || displayName));
      const accessory = new Accessory(displayName, accessoryUUID);

      // listen for the identify event if the accessory instance has defined an identify() method
      if (accessoryInstance.identify) {
        accessory.on(AccessoryEventTypes.IDENTIFY, (paired, callback) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          accessoryInstance.identify(() => { }); // empty callback for backwards compatibility
          callback();
        });
      }

      const informationService = accessory.getService(Service.AccessoryInformation);
      services.forEach(service => {
        // if you returned an AccessoryInformation service, merge its values with ours
        if (service instanceof Service.AccessoryInformation) {
          service.setCharacteristic(Characteristic.Name, displayName); // ensure display name is set
          // ensure the plugin has not hooked already some listeners (some weird ones do).
          // Otherwise they would override our identify listener registered by the HAP-NodeJS accessory
          service.getCharacteristic(Characteristic.Identify).removeAllListeners(CharacteristicEventTypes.SET);

          // pull out any values and listeners (get and set) you may have defined
          informationService.replaceCharacteristicsFromService(service);
        } else {
          accessory.addService(service);
        }
      });

      if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") {
        // overwrite the default value with the actual plugin version
        informationService.setCharacteristic(Characteristic.FirmwareRevision, "1.0");
      }

      //accessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, accessory, {}));

      controllers.forEach(controller => {
        accessory.configureController(controller);
      });

      return accessory;
    }
	}

	/**
	 * Called once, returns the list of accessories only
	 * when the list is complete
	 */
	callbackPromesedAccessoriesDo(accessoryInstance, platformType) {
		const accessoryName = accessoryInstance.name; // assume this property was set

		const uuidBase = accessoryInstance.address;

		log.info("Initializing platform accessory '%s'...", accessoryName);

		const accessory = this.createHAPAccessory(accessoryInstance, accessoryName, platformType, uuidBase);
	}

	getDevices() {
		return new Promise((resolve, reject) => {
			if (!this.ready) {
				this.log.debug("VantagePlatform for InFusion Controller (wait for getDevices promise)");
				this.callbackPromesedAccessories = resolve;
			} else {
				resolve(this.items);
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}

	/* Get accessory list 
	accessories(callback) {
		this.getDevices().then((devices) => {
			this.log.debug("VantagePlatform for InFusion Controller (accessories readed)");
			callback(devices);
		});
	}
	*/

	getAreaName(objects, vid) {
		var result = objects.filter(function(o) {
			if(o.Area == undefined) return false;
			var test = o.Area.VID === vid;
			return test;
		});
		if(result === undefined) return "";
		return result[0].Area.Name;
	}
}

class VantageThermostat {
	constructor(log, parent, name, vid, type) {
		this.DisplayName = name;
		this.name = name;
		this.UUID = UUIDGen.generate(vid);
		this.parent = parent;
		this.address = vid;
		this.log = log;
		this.temperature = 0;
		this.heating = 0;
		this.cooling = 0;
		this.type = type;
	}


	getServices() {
		var service = new Service.AccessoryInformation();
		service.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Vantage Controls")
			.setCharacteristic(Characteristic.Model, "Thermostat")
			.setCharacteristic(Characteristic.SerialNumber, "VID " + this.address);

		this.thermostatService = new Service.TemperatureSensor(this.name);
		this.thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', (callback) => {
				this.log(sprintf("getTemperature %s = %.1f",this.address, this.temperature));
				callback(null, this.temperature);
			});

		this.parent.infusion.Thermostat_GetOutdoorTemperature(this.address);
		return [service, this.thermostatService];		
	}

}

class VantageLoad {
	constructor(log, parent, name, vid, type) {
		this.displayName = name;
		this.UUID = UUIDGen.generate(vid);
		this.name = name+vid;
		this.parent = parent;
		this.address = vid;
		this.log = log;
		this.bri = 100;
		this.power = false;
		this.sat = 0;
		this.hue = 0;
		this.type = type;
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Vantage Controls")
			.setCharacteristic(Characteristic.Model, "Power Switch")
			.setCharacteristic(Characteristic.SerialNumber, "VID " + this.address);

		this.lightBulbService = new Service.Lightbulb(this.name);

		this.lightBulbService.getCharacteristic(Characteristic.On)
			.on('set', (level, callback) => {
				this.log.debug(sprintf("setPower %s = %s",this.address, level));
				this.power = (level > 0);
				if (this.power && this.bri == 0) {
					this.bri = 100;
				}
				this.parent.infusion.Load_Dim(this.address, this.power * this.bri);
				callback(null);
			})
			.on('get', (callback) => {
				this.log.debug(sprintf("getPower %s = %s",this.address, this.power));
				callback(null, this.power);
			});

		if (this.type == "dimmer" || this.type == "rgb") {
			this.lightBulbService.getCharacteristic(Characteristic.Brightness)
				.on('set', (level, callback) => {
					this.log.debug(sprintf("setBrightness %s = %d",this.address, level));
					this.bri = parseInt(level);
					this.power = (this.bri > 0);
					this.parent.infusion.Load_Dim(this.address, this.power * this.bri);
					callback(null);
				})
				.on('get', (callback) => {
					this.log(sprintf("getBrightness %s = %d",this.address, this.bri));
					callback(null, this.bri);
				});
		}

		if (this.type == "rgb") {
			this.lightBulbService.getCharacteristic(Characteristic.Saturation)
				.on('set', (level, callback) => {
					this.power = true;
					this.sat = level;
					this.parent.infusion.RGBLoad_DissolveHSL(this.address, this.hue, this.sat, this.bri)
					callback(null);
				})
				.on('get', (callback) => {
					callback(null, this.sat);
				});
			this.lightBulbService.getCharacteristic(Characteristic.Hue)
				.on('set', (level, callback) => {
					this.power = true;
					this.hue = level;
					this.parent.infusion.RGBLoad_DissolveHSL(this.address, this.hue, this.sat, this.bri)
					callback(null);
				})
				.on('get', (callback) => {
					callback(null, this.hue);
				});
		}
		this.parent.infusion.getLoadStatus(this.address);
		return [service, this.lightBulbService];
	}
}

class Logger{
	debug(string) {
		console.debug(string);
	}
	warn(string) {
		console.warn(string);
	}
	log(string) {
		console.log(string);
	}
	info(string) {
		console.info(string);
	}
}
// FOR TESTING
// var processor = new VantagePlatform(new Logger(),{ipaddress: '192.168.0.131'},null);
