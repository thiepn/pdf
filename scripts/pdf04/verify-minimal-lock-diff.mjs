// Verifies a freshly npm-regenerated lockfile is not an uncontrolled broad upgrade.
import { readFileSync } from "node:fs";
import process from "node:process";
const [oldPath,newPath] = process.argv.slice(2);
if (!oldPath || !newPath) throw new Error("Both source and regenerated lockfile are mandatory");
const before = JSON.parse(readFileSync(oldPath,"utf8"));
const after = JSON.parse(readFileSync(newPath,"utf8"));
if (before.lockfileVersion !== 3 || after.lockfileVersion !== 3) throw new Error("npm lockfile v3 required");
const names = new Set([...Object.keys(before.packages ?? {}),...Object.keys(after.packages ?? {})]);
const changed = [...names].filter(n => n !== "" && before.packages?.[n]?.version !== after.packages?.[n]?.version).sort();
console.log("Changed installed package version identities ("+changed.length+"):",JSON.stringify(changed.slice(0,70).map(n=>({name:n,from:before.packages?.[n]?.version,to:after.packages?.[n]?.version}))));
const isExpected=n=>n==="node_modules/vite"||n==="node_modules/vitest"||n==="node_modules/undici"||n.startsWith("node_modules/@vitest/")||n.startsWith("node_modules/@rolldown/")||n==="node_modules/rolldown";
const unexpected=changed.filter(n=>!isExpected(n));
if(changed.length>25||unexpected.length>4)throw new Error("Lockfile regeneration changed too many unrelated package identities; manual dependency review required (total "+changed.length+", unrelated "+unexpected.length+")");
for(const n of ["node_modules/vite","node_modules/vitest","node_modules/undici","node_modules/@vitest/mocker"])if(!after.packages[n])throw new Error("Missing required package "+n);
