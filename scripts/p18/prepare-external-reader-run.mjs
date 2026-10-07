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

import { P18_PRODUCT_BASELINE } from "./qualification-evidence.mjs";

const office=new Set(["microsoft-word","libreoffice-writer","apple-pages","other-office"]);
const pdf=new Set(["adobe-acrobat","macos-preview","pdf24","chromium-pdf","edge-pdf","android-native","ios-quicklook","other-pdf"]);
try{
  const args=argsMap();
  const artifactFile=required(args,"artifact");
  if(!fs.existsSync(artifactFile)||!fs.statSync(artifactFile).isFile())throw new Error("--artifact must point to the exported local file");
  const workflow=required(args,"workflow");
  if(!["W01","W02","W03","W04","W05"].includes(workflow))throw new Error("--workflow must be W01-W05");
  const kind=workflow==="W01"?"docx":"pdf";
  const family=required(args,"application-family");
  if(kind==="docx"&&!office.has(family))throw new Error("W01 requires an office-reader family");
  if(kind==="pdf"&&!pdf.has(family))throw new Error("W02-W05 require a PDF-reader family");
  const artifact={
    workflow_id:workflow,
    kind,
    sha256:sha256File(artifactFile),
    byte_size:fs.statSync(artifactFile).size
  };
  if(kind==="pdf"){
    const pages=Number(required(args,"page-count"));
    if(!Number.isInteger(pages)||pages<1)throw new Error("--page-count must be positive for PDF output");
    artifact.page_count=pages;
  }
  const checks=(kind==="docx"?["open","editable-structure","content","workflow-specific"]:["open","render","content","workflow-specific"]).map((id)=>({id,result:"NOT_RUN"}));
  writeJson({
    schema:1,
    baseline_commit:P18_PRODUCT_BASELINE,
    run_id:required(args,"run-id"),
    evidence_source:"human-external-application",
    human_attestation:true,
    automation_used_for_observation:false,
    source_case_id:required(args,"source-case-id"),
    artifact,
    application:{
      family,
      name:required(args,"application-name"),
      version:required(args,"application-version"),
      os_family:required(args,"os-family"),
      os_version:required(args,"os-version")
    },
    checks,
    defects:[]
  },args.get("out"));
}catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
}
