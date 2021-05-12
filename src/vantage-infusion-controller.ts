import * as net from 'net';
import {
    Logging,
} from "homebridge";
  
export class VantageInfusionController {    

  private readonly ipaddress: string;

  constructor(log: Logging, ipaddress: string) {

    log.info("Connecting to VantageInfusion Controller at ", ipaddress);
    this.ipaddress = ipaddress;
  }
}