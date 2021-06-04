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

export class VantageOutlet implements AccessoryPlugin {

  private readonly log: Logging;
  private hap: HAP;

  private vid: string;
  private controller: VantageInfusionController;
  private outletOn = false;

  name: string;

  private readonly outletService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, name: string, vid: string, controller: VantageInfusionController) {
    this.log = log;
    this.hap = hap;
    this.name = name;
    this.vid = vid;
    this.controller = controller;

    this.outletService = new hap.Service.Outlet(name);
    this.addOutletService();

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Vantage Controls")
      .setCharacteristic(hap.Characteristic.Model, "Power Switch Outlet")
      .setCharacteristic(hap.Characteristic.SerialNumber, `VID ${this.vid}`);

    // get the current state
    this.controller.sendGetLoadStatus(this.vid);
  }

  addOutletService() {
    this.outletService.getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.log.debug(`outlet ${this.name} get state: ${this.outletOn ? "ON" : "OFF"}`);
        callback(HAPStatus.SUCCESS, this.outletOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug(`outlet ${this.name} set state: ${value ? "ON" : "OFF"}`);
        this.outletOn = value as boolean;
        this.controller.sendLoadDim(this.vid, this.outletOn ? 100 : 0);
        callback();
      });
  }


  loadStatusChange(value: number) {
    this.log.debug(`outlet loadStatusChange (VID=${this.vid}, Name=${this.name}, Bri=${value}`);
    this.outletOn = (value > 0);

    this.outletService.getCharacteristic(this.hap.Characteristic.On).updateValue(this.outletOn);

  }

  identify(): void {
    this.log.info("Identify!");
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.outletService,
    ];
  }

}