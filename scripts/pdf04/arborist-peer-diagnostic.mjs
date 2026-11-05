// Isolated, token-free npm 10.9.2 diagnostic. DO NOT treat diagnostic flags
// as release qualifications or use their results for the production lockfile.
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";
const root=mkdtempSync(join(tmpdir(),"pdf04-arborist-"));
const userConfig=join(root,"user.npmrc"), globalConfig=join(root,"global.npmrc");
writeFileSync(userConfig,"");writeFileSync(globalConfig,"");
const env={
  PATH:process.env.PATH,
  HOME:root,
  npm_config_userconfig:userConfig,
  npm_config_globalconfig:globalConfig,
  npm_config_registry:"https://registry.npmjs.org/",
  npm_config_cache:join(root,"cache"),
  npm_config_audit:"false",
  npm_config_fund:"false",
  npm_config_update_notifier:"false",
  npm_config_yes:"false"
};
function npm(cwd,args){
  const r=spawnSync("npm",args,{cwd,env,encoding:"utf8",timeout:100000,maxBuffer:2*1024*1024});
  return {status:r.status,error:r.error?.code??null};
}
function meta(name,version,property){
  const result=spawnSync("npm",["view",name+"@"+version,property,"--json"],{cwd:root,env,encoding:"utf8",timeout:30000,maxBuffer:100000});
  const raw=result.stdout.trim();
  let parsed=null;try{parsed=JSON.parse(raw)}catch{}
  // Only sanitized structural metadata; do not print registry headers, URLs, or token-bearing logs.
  console.log("REGISTRY_META",JSON.stringify({name,version,property,status:result.status,values:parsed}));
}
const npmCheck=npm(root,["--version"]);console.log("TOOLCHAIN",JSON.stringify({node:process.version,npmStatus:npmCheck.status}));if(npmCheck.status!==0)throw new Error("isolated npm CLI could not initialize");
for(const [name,version,property] of [
  ["vitest","4.1.12","peerDependencies"],
  ["vitest","4.1.12","peerDependenciesMeta"],
  ["@vitest/browser-webdriverio","4.1.11","peerDependencies"],
  ["@vitest/browser-webdriverio","4.1.12","version"],
  ["vite","8.1.6","peerDependencies"],
])meta(name,version,property);
const cases=[
  {name:"vitest-4.1.12",deps:{vitest:"4.1.12"},flags:[]},
  {name:"vitest-4.1.11-control",deps:{vitest:"4.1.11"},flags:[]},
  {name:"vitest-vite-jsdom",deps:{vitest:"4.1.12",vite:"8.1.6",jsdom:"29.1.1"},flags:[]},
  {name:"vitest-4.1.12-diagnostic-peer-omit",deps:{vitest:"4.1.12"},flags:["--legacy-peer-deps"]},
];
try{
 for(const c of cases){
  const dir=join(root,c.name);mkdirSync(dir);
  writeFileSync(join(dir,"package.json"),JSON.stringify({name:"pdf04-peer-isolation",private:true,version:"0.0.0",devDependencies:c.deps}));
  const res=npm(dir,["install","--package-lock-only","--ignore-scripts","--no-audit","--no-fund","--loglevel=silly",...c.flags]);
  const logdir=join(root,"cache","_logs");
  const logs=existsSync(logdir)?readdirSync(logdir).filter(n=>n.endsWith("-debug-0.log")).sort():[];
  const log=logs.length?readFileSync(join(logdir,logs[logs.length-1]),"utf8"):"";
  // Strict whitelist: only stack method names and package identifiers; never raw log lines.
  const stack=log.split(/\r?\n/).filter(line=>/\bverbose stack\b/.test(line))
    .slice(0,12).map(line=>line.replace(/.*?verbose stack\s*/,"")
      .replace(/\([^)]*build-ideal-tree\.js:(\d+):(\d+)\)/g,"(build-ideal-tree.js:$1:$2)")
      .replace(/\([^)]*\/(arborist|reify|install)\.js:(\d+):(\d+)\)/g,"($1.js:$2:$3)")
      .replace(/\([^)]*\)/g,"(local-module)")
      .slice(0,180));
  const fetched=log.split(/\r?\n/).filter(line=>/\bsilly fetch manifest\b/.test(line))
    .map(line=>line.match(/\bsilly fetch manifest ([A-Za-z0-9@_./+*^~><=|-]+)/)?.[1])
    .filter(Boolean).slice(-12);
  console.log("PEER_CASE",JSON.stringify({name:c.name,status:res.status,error:res.error,stack,fetched}));
 }
}finally{rmSync(root,{recursive:true,force:true})}
