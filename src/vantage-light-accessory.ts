import {
  AccessoryPlugin,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
  CharacteristicEventTypes,
  HAPStatus,
} from "homebridge";

import { VantageInfusionController } from "./vantage-infusion-controller";

export interface VantageLoadObjectInterface {
  loadStatusChange(value: number) : void;
}

export function isVantageLoadObject(arg: any) : arg is VantageLoadObjectInterface {
  return arg.loadStatusChange !== undefined;

}

export class VantageLight implements AccessoryPlugin, VantageLoadObjectInterface {

  private readonly log: Logging;
  private hap: HAP;

  private vid: string;
  private controller: VantageInfusionController;
  private lightOn = false;
  private brightness: number;

  // This property must be existent!!
  name: string;

  private readonly lightService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, name: string, vid: string, controller: VantageInfusionController) {
    this.log = log;
    this.hap = hap;
    this.name = name;
    this.vid = vid;
    this.controller = controller;
    this.brightness = 100;

    this.lightService = new hap.Service.Lightbulb(name);
    this.addLightService();

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Vantage Controls")
      .setCharacteristic(hap.Characteristic.Model, "Power Switch")
      .setCharacteristic(hap.Characteristic.SerialNumber, `VID ${this.vid}`);

    // get the current state
    this.controller.sendGetLoadStatus(this.vid);
  }

  addLightService() {
    this.lightService.getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.log.debug(`lightbulb ${this.name} get state: ${this.lightOn ? "ON" : "OFF"}`);
        callback(HAPStatus.SUCCESS, this.lightOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug(`lightbulb ${this.name} set state: ${value ? "ON" : "OFF"}`);
        this.lightOn = value as boolean;
        this.brightness = this.lightOn ? 100 : 0;
        this.controller.sendLoadDim(this.vid, this.brightness);
        callback();
      });
  }


  /*
   * this is called by the platfrom, whenever a loadStatusChange occures for this vid.
   * NOTE: When changing the value vai home we send a command to the VantageController. 
   *       This will return a loadStatusChange, but we already changed the values, meaning the same value change happens twice.
   *       This is ineffiecent but shouldn't make any problems. We do this so we can remove the delay when using home.
   */
  loadStatusChange(value: number) {
    this.log.debug(`loadStatusChange (VID=${this.vid}, Name=${this.name}, Bri=${value}`);
    this.brightness = value;
    this.lightOn = (this.brightness > 0);

    this.lightService.getCharacteristic(this.hap.Characteristic.On).updateValue(this.lightOn);

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
      this.lightService,
    ];
  }

}