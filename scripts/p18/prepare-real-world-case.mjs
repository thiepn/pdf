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

import { P18_PRODUCT_BASELINE, REAL_WORLD_CATEGORIES } from "./qualification-evidence.mjs";

try{
  const args=argsMap();
  const file=required(args,"file");
  const categories=required(args,"categories").split(",").map((v)=>v.trim()).filter(Boolean);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error("--file must point to a local qualification document");
  if(!categories.length||categories.some((v)=>!REAL_WORLD_CATEGORIES.includes(v)))throw new Error(`--categories must contain only: ${REAL_WORLD_CATEGORIES.join(",")}`);
  const pageCount=Number(required(args,"page-count"));
  if(!Number.isInteger(pageCount)||pageCount<0)throw new Error("--page-count must be a non-negative integer");
  const origin=args.get("origin")??"private-local-not-committed";
  if(!["public","sanitized-nonpersonal","private-local-not-committed"].includes(origin))throw new Error("--origin is invalid");
  writeJson({
    schema:1,
    baseline_commit:P18_PRODUCT_BASELINE,
    case_id:required(args,"case-id"),
    evidence_source:"human-real-world-document",
    human_attestation:true,
    privacy_attestation:true,
    content_committed:false,
    origin_class:origin,
    source_sha256:sha256File(file),
    byte_size:fs.statSync(file).size,
    page_count:pageCount,
    categories,
    product_result:"NOT_RUN",
    defects:[]
  },args.get("out"));
}catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
}
