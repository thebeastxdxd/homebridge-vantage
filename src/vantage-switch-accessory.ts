import {
  AccessoryPlugin,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
  CharacteristicEventTypes,
} from "homebridge";

import { VantageInfusionController } from "./vantage-infusion-controller";

export class VantageSwitch implements AccessoryPlugin {

  private readonly log: Logging;
  private hap: HAP;

  private vid: string;
  private controller: VantageInfusionController;
  private switchOn = false;


  // This property must be existent!!
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
        callback(undefined, this.switchOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug(`switch ${this.name} set state: ${value ? "ON" : "OFF"}`);
        this.switchOn = value as boolean;
        this.controller.sendLoadDim(this.vid, this.switchOn ? 100 : 0);
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
    this.log.debug(`switch loadStatusChange (VID=${this.vid}, Name=${this.name}, Bri=${value}`);
    this.switchOn = (value > 0);

    this.switchService.getCharacteristic(this.hap.Characteristic.On).updateValue(this.switchOn);

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
      this.switchService,
    ];
  }

}