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

export class VantageLight implements AccessoryPlugin {

  private readonly log: Logging;
  private hap: HAP;

  private vid: string;
  private controller: VantageInfusionController;
  private lightOn = false;
  private brightness: number;
  private saturation: number;
  private hue: number;
  private loadType: string;


  // This property must be existent!!
  name: string;

  private readonly lightService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, name: string, vid: string, controller: VantageInfusionController, loadType: string) {
    this.log = log;
    this.hap = hap;
    this.name = name;
    this.vid = vid;
    this.controller = controller;
    this.brightness = 100;
    this.saturation = 0;
    this.hue = 0;
    this.loadType = loadType;

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
        callback(undefined, this.lightOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug(`lightbulb ${this.name} set state: ${value ? "ON" : "OFF"}`);
        this.lightOn = value as boolean;
        this.brightness = this.lightOn ? 100 : 0;
        this.controller.sendLoadDim(this.vid, this.brightness);
        callback();
      });

    if (this.loadType == "dimmer" || this.loadType == "rgb") {
      this.addDimmerLightService();
    }

    if (this.loadType == "rgb") {
      this.addRGBLightService();
    }
  }

  /*
   * adds dimmer control to light service
   */
  addDimmerLightService() {
    this.lightService.getCharacteristic(this.hap.Characteristic.Brightness)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.log.debug(`lightbulb ${this.name} get brightness state: ${this.brightness}`);
        callback(undefined, this.brightness);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug(`lightbulb ${this.name} set brightness state: ${value}`);
        this.brightness = value as number;
        this.lightOn = (this.brightness > 0);
        this.controller.sendLoadDim(this.vid, this.lightOn ? this.brightness : 0);
        callback();
      });
  }

  /*
   * adds RGB control to light service
   * NOTE: this was not checked! Probably doesnt work
   */
  addRGBLightService() {
    this.lightService.getCharacteristic(this.hap.Characteristic.Saturation)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        callback(null, this.saturation);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.lightOn = true;
        this.saturation = value as number;
        this.controller.sendRGBLoadDissolveHSL(this.vid, this.hue, this.saturation, this.brightness);
        callback();
      });

    this.lightService.getCharacteristic(this.hap.Characteristic.Hue)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        callback(null, this.hue);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.lightOn = true;
        this.hue = value as number;
        this.controller.sendRGBLoadDissolveHSL(this.vid, this.hue, this.saturation, this.brightness);
        callback();
      });
  }


  /*
   * this is called by the platfrom, whenever a loadStatusChange occures for this vid
   */
  loadStatusChange(value: number) {
    this.log.debug(`loadStatusChange (VID=${this.vid}, Name=${this.name}, Bri=${value}`);
    // TODO: kinda weird because we are changing the values here and also in the SET callbacks
    this.brightness = value;
    this.lightOn = (this.brightness > 0);

    //this.lightService.getCharacteristic(this.hap.Characteristic.On).updateValue(this.lightOn);
    this.lightService.getCharacteristic(this.hap.Characteristic.On).getValue(undefined, this.lightOn);

    if (this.loadType == "rgb" || this.loadType == "dimmer") {
      //this.lightService.getCharacteristic(this.hap.Characteristic.Brightness).updateValue(this.brightness);
      this.lightService.getCharacteristic(this.hap.Characteristic.Brightness).getValue(undefined, this.brightness);
    }
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