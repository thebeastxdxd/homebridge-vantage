import * as net from 'net';
import {
    Logging,
} from "homebridge";
  
export class VantageInfusionController {    

  private readonly ipaddress: string;
  private server: net.Socket;
  private readonly log: Logging;

  constructor(log: Logging, ipaddress: string) {

    this.log = log;
    this.ipaddress = ipaddress;
    this.server = new net.Socket();
    this.server.on('data', (data: Buffer) => {
      this.log.info(data.toString());
    });
    this.log.info("Connecting to VantageInfusion Controller at ", ipaddress);
    this.server.connect({host: this.ipaddress, port: 3001}, () => {
			this.server.write("STATUS ALL\n");
			this.server.write("ELENABLE 1 AUTOMATION ON\nELENABLE 1 EVENT ON\nELENABLE 1 STATUS ON\nELENABLE 1 STATUSEX ON\nELENABLE 1 SYSTEM ON\nELLOG AUTOMATION ON\nELLOG EVENT ON\nELLOG STATUS ON\nELLOG STATUSEX ON\nELLOG SYSTEM ON\n");
    });
  }


}