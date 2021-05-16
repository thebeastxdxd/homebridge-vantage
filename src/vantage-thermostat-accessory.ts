import {
  AccessoryPlugin,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
  CharacteristicEventTypes,
  Characteristic
} from "homebridge";
import { on } from "process";

import { VantageInfusionController } from "./vantage-infusion-controller";

export class VantageThermostat implements AccessoryPlugin {

  private readonly log: Logging;
  private hap: HAP;

  private vid: string;
  private controller: VantageInfusionController;
  private temperature: number;


  // This property must be existent!!
  name: string;

  private readonly temperatureSensorService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, name: string, vid: string, controller: VantageInfusionController) {
    this.log = log;
    this.hap = hap;
    this.name = name;
    this.vid = vid;
    this.controller = controller;
    this.temperature = 0;

    this.temperatureSensorService = new hap.Service.TemperatureSensor(name);
    this.temperatureSensorService.getCharacteristic(hap.Characteristic.CurrentTemperature)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.log.debug(`thermostat ${this.name} get temperature: ${this.temperature}`);
        callback(null, this.temperature);

    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {

        this.log.debug(`thermostat ${this.name} set temperature: ${value}`);
        this.temperature = value as number;
        callback();
    })

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Vantage Controls")
      .setCharacteristic(hap.Characteristic.Model, "Power Switch")
      .setCharacteristic(hap.Characteristic.SerialNumber, `VID ${this.vid}`);

    // get the current state
    this.controller.sendThermostatGetOutdoorTemperature(this.vid);
  }

  temperatureChange(value: number) {
    this.temperatureSensorService.getCharacteristic(this.hap.Characteristic.CurrentTemperature).setValue(value);
  }


  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log.info("Identify!");
  }


  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.informationService,
      this.temperatureSensorService,
    ];
  }

}