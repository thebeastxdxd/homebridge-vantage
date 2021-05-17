
import { AccessoryPlugin, API, HAP, Logging, PlatformConfig, StaticPlatformPlugin, } from "homebridge";
import { VantageLight } from "./vantage-light-accessory";
import { VantageThermostat } from "./vantage-thermostat-accessory";
import { VantageInfusionController, EndDownloadConfigurationEvent, LoadStatusChangeEvent, ThermostatIndoorTemperatureChangeEvent, ThermostatOutdoorTemperatureChangeEvent } from "./vantage-infusion-controller";
import * as xml2json from 'xml2json'

const PLUGIN_NAME = "homebridge-vantage-static";
const PLATFORM_NAME = "VantageControls";

const BRIDGE_ACCESSORY_LIMIT = 149;

let hap: HAP;

export = (api: API) => {
  hap = api.hap;

  api.registerPlatform(PLATFORM_NAME, VantageStaticPlatform);
};

class VantageStaticPlatform implements StaticPlatformPlugin {

  private readonly log: Logging;
  private vantageController: VantageInfusionController;
  private interfaceSupportRequest: Array<Promise<void>>;
  private accessoriesDict: { [key: string]: AccessoryPlugin };
  private vidNameMapping: { [key: string]: string };
  private whitelist: Array<string>;
  private accessoriesCallback: (foundAccessories: AccessoryPlugin[]) => void;
  private api: API;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.interfaceSupportRequest = [];
    this.accessoriesDict = {};
    this.vidNameMapping = {};
    this.whitelist = [];
    this.accessoriesCallback = () => { };
    this.api = api;

    if (config.controllerSendInterval) {
      this.vantageController = new VantageInfusionController(this.log, config.ipaddress, config.controllerSendInterval);
    } else {
      this.vantageController = new VantageInfusionController(this.log, config.ipaddress);
    }

    if (config.nameMapping) {
      this.vidNameMapping = config.nameMapping;
    }

    if (config.whitelist) {
      this.whitelist = config.whitelist;
    }

    // add callbacks to events
    this.vantageController.on(EndDownloadConfigurationEvent, this.endDownloadConfigurationCallback.bind(this));
    this.vantageController.on(LoadStatusChangeEvent, this.loadStatusChangeCallback.bind(this));
    this.vantageController.on(ThermostatIndoorTemperatureChangeEvent, this.thermostatIndoorTemperatureChangeCallback.bind(this));
    this.vantageController.on(ThermostatOutdoorTemperatureChangeEvent, this.thermostatOutdoorTemperatureChangeCallback.bind(this));

    // start downloading server's database
    this.vantageController.serverConfigurationDownload();

    this.log.info("Done initializing homebridge vantage platform");
  }

  vidToName(vid: string): string {
    if (this.vidNameMapping && vid in this.vidNameMapping) {
      return this.vidNameMapping[vid];
    } else {
      return "";
    }
  }

  loadStatusChangeCallback(vid: string, value: number) {
    if (this.accessoriesDict[vid] && this.accessoriesDict[vid] instanceof VantageLight) {
      const accessory = this.accessoriesDict[vid] as VantageLight;
      accessory.loadStatusChange(value);
    }
  }

  thermostatOutdoorTemperatureChangeCallback(vid: string, value: number) {
    if (this.accessoriesDict[vid] && this.accessoriesDict[vid] instanceof VantageThermostat) {
      const accessory = this.accessoriesDict[vid] as VantageThermostat;
      accessory.temperatureChange(value);
    }
  }

  thermostatIndoorTemperatureChangeCallback(vid: string, value: number) {
    if (this.accessoriesDict[vid] && this.accessoriesDict[vid] instanceof VantageThermostat) {
      const accessory = this.accessoriesDict[vid] as VantageThermostat;
      accessory.temperatureChange(value);
    }
  }

  /*
  * this callback will be called when we fully received the dc database from the controller (or from a saved file)
  */
  endDownloadConfigurationCallback(configurationString: string) {
    this.log.info("Vantage Platfrom done Downloading configuration.");

    const configuration = JSON.parse(xml2json.toJson(configurationString));

    configuration.Project.Objects.Object.forEach((objectWrapper: any) => {
      const mainItemkey = Object.keys(objectWrapper)[0];
      const item = objectWrapper[mainItemkey];
      const itemAreaName = item.Area ? this.getAreaName(configuration.Project.Objects.Object, item.Area) : "";

      this.addItem(item, itemAreaName);
    });

    // add the promise after all the requests were sent
    Promise.all(this.interfaceSupportRequest).then((_values: any[]) => {
      let accessories = Object.values(this.accessoriesDict);

      if (accessories.length > BRIDGE_ACCESSORY_LIMIT) {
        this.log.info(`there are too many accessories for one bridge: ${accessories.length}`);
        let platfromAccessories = accessories.slice(0, BRIDGE_ACCESSORY_LIMIT);
        let leftOverAccesssories = accessories.slice(BRIDGE_ACCESSORY_LIMIT);
        this.accessoriesCallback(leftOverAccesssories);
      } else {
        this.accessoriesCallback(accessories);
      }
    })
  }

  checkWhitelist(vid: string) {
    if (this.whitelist.length === 0) {
      return true;
    } else {
      return this.whitelist.includes(vid);
    }
  }

  /*   
  Example for an item
  <Object> <-- objectWrapper
    <Category VID="21" Master="22" MTime=""> <-- mainItemKey
      <Name>HVAC</Name> <-- item
      <Model>
      </Model>
      <Note>
      </Note>
      <DName>
      </DName>
      <ObjectType>Category</ObjectType>
      <Category>7</Category>
      <Location>3</Location>
    </Category>
  </Object>
  */
  addItem(item: any, areaName: string) {
    if (this.checkWhitelist(item.VID)) {
      if (item.ObjectType == "HVAC") {
        this.addHVACObjectType(item);
      }
      if (item.ObjectType == "Load") {
        this.addLoadObjectType(item, areaName);
      }
    }
  }

  addInterfaceSupportPromise(item: any, objectType: string, callback: any) {
    const promise = this.vantageController.isInterfaceSupported(item, objectType).then((response) => callback(response));
    this.interfaceSupportRequest.push(promise);
  }

  // TODO: little bit a code duplication with addLoadObjectType
  addHVACObjectType(item: any) {
    // normalize to use Name instead of DName
    if (item.DName !== undefined && item.DName != "") {
      item.Name = item.DName;
    }
    this.log.debug(`New HVAC asked (VID=${item.VID}, Name=${item.Name}, ---)`);
    const callback = (response: { item: any, interface: string, support: boolean }) => {
      if (response.support) {
        const name = this.vidToName(response.item.Name) || response.item.Name;

        this.log.info(`New HVAC added (VID=${item.VID}, Name=${item.Name}, THERMOSTAT)`);
        this.accessoriesDict[item.VID] = new VantageThermostat(hap, this.log, name, response.item.VID, this.vantageController);
      }
    };

    this.addInterfaceSupportPromise(item, "Thermostat", callback);
  }

  addLoadObjectType(item: any, areaName: string) {
    // change Area vid to the corresponding Area object's name
    item.Area = areaName; 

    this.log.debug(`New load asked (VID=${item.VID}, Name=${item.Name}, ---)`)
    const callback = (response: { item: any, interface: string, support: boolean }) => {
      if (response.support) {
        // create a name with the area's name and the item's name
        const loadType = this.getLoadType(response.item);
        const name = this.vidToName(response.item.Name) || `${response.item.Area}-${response.item.Name}`;

        this.log.info(`New load added (VID=${item.VID}, Name=${item.Name}, ${loadType})`);
        this.accessoriesDict[item.VID] = new VantageLight(hap, this.log, name, response.item.VID, this.vantageController, loadType);
      }
    };

    this.addInterfaceSupportPromise(item, "Load", callback);

  }

  /*
   * Find item's matching Area object, return its name.
   */
  getAreaName(objects: any, areaVid: string) {
    const areaObject: Array<any> = objects.filter((object: any) => {
      if (object.Area === undefined) {
        return false;
      }
      return object.Area.VID === areaVid;
    });

    if (areaObject.length === 0) {
      return "";
    }

    return areaObject[0].Area.Name;
  }

  getLoadType(item: any) {
    if (!item.LoadType.includes("Relay") && !item.LoadType.includes("Motor")) {
      // TODO?: add check if its a a Dimmer or a RGB load
      return "dimmer";
    } else {
      return "relay";
    }
  }

  // can call callback at a later time, but it will stop the bridge from loading
  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    this.accessoriesCallback = callback;
  }
}