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

export class VantageFan implements AccessoryPlugin {

  private readonly log: Logging;
  private hap: HAP;

  private vid: string;
  private controller: VantageInfusionController;
  private fanOn = false;

  name: string;

  private readonly fanService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, name: string, vid: string, controller: VantageInfusionController) {
    this.log = log;
    this.hap = hap;
    this.name = name;
    this.vid = vid;
    this.controller = controller;

    this.fanService = new hap.Service.Fan(name);
    this.addFanService();

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Vantage Controls")
      .setCharacteristic(hap.Characteristic.Model, "Power Switch Fan")
      .setCharacteristic(hap.Characteristic.SerialNumber, `VID ${this.vid}`);

    // get the current state
    this.controller.sendGetLoadStatus(this.vid);
  }

  addFanService() {
    this.fanService.getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.log.debug(`fan ${this.name} get state: ${this.fanOn ? "ON" : "OFF"}`);
        callback(HAPStatus.SUCCESS, this.fanOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug(`fan ${this.name} set state: ${value ? "ON" : "OFF"}`);
        this.fanOn = value as boolean;
        this.controller.sendLoadDim(this.vid, this.fanOn ? 100 : 0);
        callback();
      });
  }

  loadStatusChange(value: number) {
    this.log.debug(`Fan loadStatusChange (VID=${this.vid}, Name=${this.name}, Bri=${value}`);
    this.fanOn = (value > 0);

    this.fanService.getCharacteristic(this.hap.Characteristic.On).updateValue(this.fanOn);

  }


  identify(): void {
    this.log.info("Identify!");
  }


  getServices(): Service[] {
    return [
      this.informationService,
      this.fanService,
    ];
  }

}