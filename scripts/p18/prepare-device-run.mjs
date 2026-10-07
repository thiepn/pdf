#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function argsMap(argv=process.argv.slice(2)){
  const result=new Map();
  for(let i=0;i<argv.length;i++){
    const token=argv[i];
    if(!token.startsWith("--")) continue;
    const key=token.slice(2);
    const value=argv[i+1]&&!argv[i+1].startsWith("--")?argv[++i]:"true";
    result.set(key,value);
  }
  return result;
}
export function required(args,key){
  const value=args.get(key);
  if(!value)throw new Error(`--${key} is required`);
  return value;
}
export function sha256File(file){
  const hash=crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}
export function writeJson(value,out){
  const text=JSON.stringify(value,null,2)+"\n";
  if(out){
    fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
    fs.writeFileSync(out,text);
    console.error(`Wrote ${out}`);
  }else process.stdout.write(text);
}

import { P18_BUILD_CHANNEL, P18_PRODUCT_BASELINE } from "./qualification-evidence.mjs";

try{
  const args=argsMap();
  const integrity=required(args,"release-integrity-file");
  if(!fs.existsSync(integrity)||!fs.statSync(integrity).isFile())throw new Error("--release-integrity-file must point to the downloaded qualification release-integrity.json");
  const deviceClass=required(args,"device-class");
  if(!["desktop","laptop","phone","tablet"].includes(deviceClass))throw new Error("--device-class is invalid");
  const appMode=required(args,"app-mode");
  if(!["browser","installed-pwa"].includes(appMode))throw new Error("--app-mode must be browser or installed-pwa");
  writeJson({
    schema:1,
    baseline_commit:P18_PRODUCT_BASELINE,
    run_id:required(args,"run-id"),
    tester_id:required(args,"tester-id"),
    evidence_source:"human-physical-device",
    human_attestation:true,
    physical_device:true,
    simulator_or_emulator:false,
    automation_used_for_observation:false,
    environment:{
      date:required(args,"date"),
      device_class:deviceClass,
      device_model:required(args,"device-model"),
      os_family:required(args,"os-family"),
      os_version:required(args,"os-version"),
      browser_family:required(args,"browser-family"),
      browser_name:required(args,"browser-name"),
      browser_version:required(args,"browser-version"),
      input_mode:required(args,"input-mode"),
      viewport:required(args,"viewport"),
      app_mode:appMode,
      build_channel:P18_BUILD_CHANNEL,
      release_integrity_sha256:sha256File(integrity)
    },
    workflow_results:[
      {id:"W01",workflow:"Layout-aware PDF to DOCX export",result:"NOT_RUN",source_case_id:null,artifact_sha256:null},
      {id:"W02",workflow:"Arabic/RTL existing-text edit and export",result:"NOT_RUN",source_case_id:null,artifact_sha256:null},
      {id:"W03",workflow:"Target-size structure-preserving compression",result:"NOT_RUN",source_case_id:null,artifact_sha256:null},
      {id:"W04",workflow:"Batch v4 with encrypted queue input",result:"NOT_RUN",source_case_id:null,artifact_sha256:null},
      {id:"W05",workflow:"Deep native-content edit and export",result:"NOT_RUN",source_case_id:null,artifact_sha256:null},
      {id:"W06",workflow:"Reload/offline/installed-PWA reopen and recovery",result:"NOT_RUN",source_case_id:null,artifact_sha256:null}
    ],
    defects:[]
  },args.get("out"));
}catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
}
