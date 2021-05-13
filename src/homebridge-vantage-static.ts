import {AccessoryPlugin, API, HAP, Logging, PlatformConfig, StaticPlatformPlugin,} from "homebridge";
import {VantageLight} from "./vantage-light-accessory";
import {VantageInfusionController} from "./vantage-infusion-controller";

const PLUGIN_NAME = "homebridge-vantage-static";
const PLATFORM_NAME = "VantageConrols";

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

    this.vantageController = new VantageInfusionController(log, config.ipaddress);

    log.info("Example platform finished initializing!");
  }

  // can call callback at a later time, but it will stop the bridge from loading
  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    callback([
      new VantageLight(hap, this.log, "Switch 1"),
      new VantageLight(hap, this.log, "Switch 2"),
    ]);
  }

}