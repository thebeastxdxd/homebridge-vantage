import {AccessoryPlugin, API, HAP, Logging, PlatformConfig, StaticPlatformPlugin,} from "homebridge";
import {VantageLight} from "./vantage-light-accessory";

const PLATFORM_NAME = "homebridge-vantage-static";

let hap: HAP;

export = (api: API) => {
  hap = api.hap;

  api.registerPlatform(PLATFORM_NAME, VantageStaticPlatform);
};

class VantageStaticPlatform implements StaticPlatformPlugin {

  private readonly log: Logging;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;

    // probably parse config or something here

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