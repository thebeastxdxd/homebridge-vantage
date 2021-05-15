
import { AccessoryPlugin, API, HAP, Logging, PlatformConfig, StaticPlatformPlugin, } from "homebridge";
import { VantageLight } from "./vantage-light-accessory";
import { VantageInfusionController, EndDownloadConfigurationEvent, LoadStatusChangeEvent } from "./vantage-infusion-controller";
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
  private interfaceSupportRequest: Array<Promise<void>>;
  private accessoriesDict: { [key in string]: AccessoryPlugin };
  private accessoriesCallback:(foundAccessories: AccessoryPlugin[]) => void ;
  private api: API;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.interfaceSupportRequest = [];
    this.accessoriesDict = {};
    this.accessoriesCallback = () => {};
    this.api = api;

    if (config.controllerSendInterval) {
      this.vantageController = new VantageInfusionController(this.log, config.ipaddress, config.controllerSendInterval);
    } else {
      this.vantageController = new VantageInfusionController(this.log, config.ipaddress);
    }

    this.vantageController.on(EndDownloadConfigurationEvent, this.endDownloadConfigurationCallback.bind(this));
    this.vantageController.on(LoadStatusChangeEvent, this.loadStatusChangeCallback.bind(this));

    this.vantageController.serverConfigurationDownload();

    this.log.info("Done initializing homebridge vantage platform");
  }

  loadStatusChangeCallback(vid: string, value: number) {
  }

  endDownloadConfigurationCallback(configurationString: string) {
    this.log.info("Vantage Platfrom done Downloading configuration.");
    const configuration = JSON.parse(xml2json.toJson(configurationString));
    configuration.Project.Objects.Object.forEach((objectWrapper: any) => {
      /*   
      Example for an item
      <Object> <-- objectWrapper
        <Category VID="21" Master="22" MTime=""> <-- mainItemKey
          <Name>HVAC</Name> <-- item
          <Model>
          </Model>
          <Note>
          </Note>
          <DName>
          </DName>
          <ObjectType>Category</ObjectType>
          <Category>7</Category>
          <Location>3</Location>
        </Category>
      </Object>
      */
      const mainItemkey = Object.keys(objectWrapper)[0];
      const item = objectWrapper[mainItemkey];

      if (item.ExcludeFromWidgets === undefined || item.ExcludeFromWidgets == "False") {
        if (item.ObjectType == "HVAC") {
          this.addHVACObjectType(item);
        }
        if (item.ObjectType == "Load") {
          this.addLoadObjectType(configuration.Project.Objects.Object, item);
        }
      }
    });

    Promise.all(this.interfaceSupportRequest).then((_values: any[]) => {
      this.log.info(`adding ${_values.length} accessories`);
      let accessories = Object.values(this.accessoriesDict);
      let platfromAccessories = accessories.slice(0, 149);
      let leftOverAccesssories = accessories.slice(149);
      this.log.info(`there are too many accessories for one bridge: ${accessories.length}`);
      this.accessoriesCallback(platfromAccessories);
    })
  }

  addHVACObjectType(item: any) {
    if (item.DName !== undefined && item.DName != "") {
      item.Name = item.DName;
    }

    this.log.info(`New HVAC asked (VID=${item.VID}, Name=${item.Name}, ---)`);
    const promise = this.vantageController.isInterfaceSupported(item, "Thermostat").then((response) => {
      if (response.support) {
        this.log.info(`New HVAC added (VID=${item.VID}, Name=${item.Name}, THERMOSTAT)`);
        //this.accessoriesDict[item.VID] = new VantageLight(hap, this.log, item.Name);
      }
    });

    this.interfaceSupportRequest.push(promise);
  }

  addLoadObjectType(objects: any, item: any) {

    this.log.info(`New load asked (VID=${item.VID}, Name=${item.Name}, ---)`)
    // change Area vid to the corresponding Area object's name
    item.Area = this.getAreaName(objects, item.Area);
    const promise = this.vantageController.isInterfaceSupported(item, "Load").then((response) => {
      if (response.support) {
        // create a name with the area's name and the item's name
        const name = `${response.item.Area}-${response.item.Name}`;
        const loadType = this.getLoadType(response.item);

        // this.log.info(`New load added (VID=${item.VID}, Name=${item.Name}, DIMMER)`);
        this.accessoriesDict[item.VID] = new VantageLight(hap, this.log, name, response.item.VID, loadType);
      }
    });

    this.interfaceSupportRequest.push(promise);
  }

  /*
   * Find item's matching Area object, return its name.
   */
  getAreaName(objects: any, areaVid: string) {
    const areaObject = objects.filter((object: any) => {
      if (object.Area === undefined) {
        return false;
      }
      return object.Area.VID === areaVid;
    });

    if (areaObject === undefined) {
      return "";
    }

    return areaObject[0].Area.Name;
  }

  getLoadType(item: any) {
    if (!item.LoadType.includes("Relay") && !item.LoadType.includes("Motor")) {
      // TODO?: add check if its a a Dimmer or a RGB load
      return "dimmer";
    } else {
      return "relay";
    }
  }

  // can call callback at a later time, but it will stop the bridge from loading
  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    this.accessoriesCallback = callback;
  }

}