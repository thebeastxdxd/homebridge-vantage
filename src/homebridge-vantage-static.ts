
import {AccessoryPlugin, API, HAP, Logging, PlatformConfig, StaticPlatformPlugin,} from "homebridge";
import {VantageLight} from "./vantage-light-accessory";
import {VantageInfusionController, EndDownloadConfigurationEvent, LoadStatusChangeEvent} from "./vantage-infusion-controller";
import * as xml2json from 'xml2json'

const PLUGIN_NAME = "homebridge-vantage-static";
const PLATFORM_NAME = "VantageControls";

let hap: HAP;

export = (api: API) => {
  hap = api.hap;

  api.registerPlatform(PLATFORM_NAME, VantageStaticPlatform);
};

class VantageStaticPlatform implements StaticPlatformPlugin {

  private readonly log: Logging;
  private vantageController: VantageInfusionController;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;

    this.vantageController = new VantageInfusionController(this.log, config.ipaddress);
    this.vantageController.serverConfigurationDownload();

    this.vantageController.on(EndDownloadConfigurationEvent, this.endDownloadConfigurationCallback.bind(this));
    this.vantageController.on(LoadStatusChangeEvent, this.loadStatusChangeCallback.bind(this));

    this.log.info("Done initializing homebridge vantage platform");
  }

  loadStatusChangeCallback(vid: string, value: number) {

  }

  endDownloadConfigurationCallback(configurationString: any) {
    this.log.info("Vantage Platfrom done Downloading configuration.");
    this.log.debug(configurationString);
    const configuration = JSON.parse(xml2json.toJson(configurationString));
  }

  // can call callback at a later time, but it will stop the bridge from loading
  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    callback([
      new VantageLight(hap, this.log, "Switch 1"),
      new VantageLight(hap, this.log, "Switch 2"),
    ]);
  }

}