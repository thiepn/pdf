#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEvidence, summarizeQualification, P18_PRODUCT_BASELINE } from "./qualification-evidence.mjs";

const STABLE_COMMIT="2116a61b73b6fdb18aa19a8175d9ebae4b43c159";

function assertion(condition,message){if(!condition)throw new Error(message);}
function sha(value,field){assertion(typeof value==="string"&&/^[0-9a-f]{40}$/.test(value),`${field} must be a 40-character lowercase Git SHA`);}
function httpsUrl(value,field){assertion(typeof value==="string"&&value.startsWith("https://")&&value.endsWith("/"),`${field} must be an HTTPS URL ending in /`);}

export function expectedFieldworkState(summary){
  if(summary.certificationStatus==="P18_V72_QUALIFIED") return "CERTIFIED";
  if(summary.realWorld.status==="REAL_WORLD_BLOCKED"||summary.externalReaders.status==="EXTERNAL_READER_BLOCKED"||summary.physicalDevices.status==="PHYSICAL_DEVICE_BLOCKED") return "BLOCKED";
  const measured=(summary.realWorld.cases??0)+(summary.externalReaders.runs??0)+(summary.physicalDevices.runs??0);
  return measured>0 ? "IN_PROGRESS" : "OPEN_NO_EVIDENCE";
}

export function validateFieldHost(config,summary){
  assertion(config&&typeof config==="object"&&!Array.isArray(config),"P18 field-host config must be an object");
  assertion(config.schema===1&&config.phase==="P18","P18 field-host schema/phase invalid");
  sha(config.product_baseline_commit,"product_baseline_commit");
  sha(config.stable_tag_commit,"stable_tag_commit");
  assertion(config.product_baseline_commit===P18_PRODUCT_BASELINE,"P18 field-host baseline must equal frozen P17 product baseline");
  assertion(config.stable_version==="7.1.4"&&config.stable_tag==="v7.1.4"&&config.stable_tag_commit===STABLE_COMMIT,"P18 field host must preserve published Stable v7.1.4");
  httpsUrl(config.stable_page_url,"stable_page_url");
  httpsUrl(config.qualification_url,"qualification_url");
  assertion(typeof config.qualification_path==="string"&&/^[a-z0-9][a-z0-9/_-]*$/.test(config.qualification_path),"qualification_path is invalid");
  assertion(!config.qualification_path.startsWith("/")&&!config.qualification_path.endsWith("/"),"qualification_path must be relative");
  assertion(config.qualification_url===`${config.stable_page_url}${config.qualification_path}/`,"qualification_url must equal stable_page_url + qualification_path");
  assertion(config.root_preservation_contract==="live-release-integrity-byte-match","root preservation must stay fail-closed");
  assertion(config.observation_policy==="human-physical-device-and-external-application-only","observation policy must remain human-only");
  const expected=expectedFieldworkState(summary);
  assertion(config.fieldwork_state===expected,`fieldwork_state must equal derived ${expected}`);
  assertion(config.active===(expected!=="CERTIFIED"),"P18 qualification host must stay active until certified and deactivate after certification");
  return {
    schema:1,phase:"P18",
    status:expected==="OPEN_NO_EVIDENCE"?"P18_FIELDWORK_READY":expected==="IN_PROGRESS"?"P18_FIELDWORK_IN_PROGRESS":expected==="BLOCKED"?"P18_FIELDWORK_BLOCKED":"P18_FIELDWORK_CERTIFIED",
    active:config.active,fieldwork_state:config.fieldwork_state,qualification_url:config.qualification_url,
    product_baseline_commit:config.product_baseline_commit,certification_status:summary.certificationStatus
  };
}

function runCli(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
  try{
    const summary=summarizeQualification(loadEvidence(root));
    const cfg=JSON.parse(fs.readFileSync(path.join(root,"docs/p18/field-host.json"),"utf8"));
    console.log(JSON.stringify(validateFieldHost(cfg,summary),null,2));
  }catch(error){
    console.error(JSON.stringify({status:"P18_FIELD_HOST_INVALID",error:error instanceof Error?error.message:String(error)},null,2));
    process.exitCode=1;
  }
}
const invoked=process.argv[1]?path.resolve(process.argv[1]):"";
if(invoked===fileURLToPath(import.meta.url))runCli();
