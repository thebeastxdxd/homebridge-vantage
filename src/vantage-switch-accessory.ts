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
import { VantageLoadObjectInterface} from "./vantage-light-accessory";

export class VantageSwitch implements AccessoryPlugin, VantageLoadObjectInterface {

  private readonly log: Logging;
  private hap: HAP;

  private vid: string;
  private controller: VantageInfusionController;
  private switchOn = false;

  name: string;

  private readonly switchService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, name: string, vid: string, controller: VantageInfusionController) {
    this.log = log;
    this.hap = hap;
    this.name = name;
    this.vid = vid;
    this.controller = controller;

    this.switchService = new hap.Service.Switch(name);
    this.addSwitchService();

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Vantage Controls")
      .setCharacteristic(hap.Characteristic.Model, "Power Switch Switch")
      .setCharacteristic(hap.Characteristic.SerialNumber, `VID ${this.vid}`);

    // get the current state
    this.controller.sendGetLoadStatus(this.vid);
  }

  addSwitchService() {
    this.switchService.getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.log.debug(`switch ${this.name} get state: ${this.switchOn ? "ON" : "OFF"}`);
        callback(HAPStatus.SUCCESS, this.switchOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug(`switch ${this.name} set state: ${value ? "ON" : "OFF"}`);
        this.switchOn = value as boolean;
        this.controller.sendLoadDim(this.vid, this.switchOn ? 100 : 0);
        callback();
      });
  }


  loadStatusChange(value: number) {
    this.log.debug(`switch loadStatusChange (VID=${this.vid}, Name=${this.name}, Bri=${value}`);
    this.switchOn = (value > 0);

    this.switchService.getCharacteristic(this.hap.Characteristic.On).updateValue(this.switchOn);

  }


  identify(): void {
    this.log.info("Identify!");
  }

  
  getServices(): Service[] {
    return [
      this.informationService,
      this.switchService,
    ];
  }

}