import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sourceRoot = join(root, "src");
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if ([".ts", ".tsx"].includes(extname(path))) out.push(path);
  }
  return out;
}
const files = await walk(sourceRoot);
const findings = [];
const failures = [];
const networkSinkPatterns = [/\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bsendBeacon\b/, /\bEventSource\b/];
const allowedExternalFetch = "src/ocr/languagePackManager.ts";
let externalFetches = 0;
let forbiddenSinks = 0;
let riskyPersistence = 0;
for (const file of files) {
  const rel = relative(root, file).replaceAll("\\", "/");
  const text = await readFile(file, "utf8");
  for (const pattern of networkSinkPatterns) {
    if (pattern.test(text)) { forbiddenSinks += 1; failures.push(`${rel}: forbidden network sink ${pattern}`); }
  }
  const absoluteUrls = [...text.matchAll(/https?:\/\/[^`'"\s)]+/g)].map((match) => match[0]);
  const hasFetch = /\bfetch\(/.test(text);
  for (const url of absoluteUrls) {
    if (!hasFetch) continue;
    if (url.startsWith("https://tessdata.projectnaptha.com/")) {
      externalFetches += 1;
      if (rel !== allowedExternalFetch) failures.push(`${rel}: OCR external URL appears outside the approved downloader`);
    }
  }
  const directPasswordPersistence = [
    /localStorage\.(?:setItem|getItem)\([^\n;]*(?:userPassword|ownerPassword|password)/i,
    /sessionStorage\.(?:setItem|getItem)\([^\n;]*(?:userPassword|ownerPassword|password)/i,
    /idbPut(?:<[^>]+>)?\([^\n;]*(?:userPassword|ownerPassword)/i
  ].some((pattern) => pattern.test(text));
  if (directPasswordPersistence && !["src/security/securityRepository.ts", "src/projects/projectPackage.ts"].includes(rel)) {
    riskyPersistence += 1;
    failures.push(`${rel}: password token is passed directly to a persistence sink`);
  }
}
const index = await readFile(join(root, "index.html"), "utf8");
const packageSource = await readFile(join(root, "src/projects/projectPackage.ts"), "utf8");
const securityRepo = await readFile(join(root, "src/security/securityRepository.ts"), "utf8");
const maintenance = await readFile(join(root, "src/maintenance/maintenance.ts"), "utf8");
const releaseValidation = await readFile(join(root, "src/release/releaseValidation.ts"), "utf8");

const checks = [
  ["CSP", /Content-Security-Policy/.test(index) && /connect-src 'self' https:\/\/tessdata\.projectnaptha\.com/.test(index) && /object-src 'none'/.test(index), "CSP limits network and embedded-object capabilities"],
  ["referrer policy", /name="referrer" content="no-referrer"/.test(index), "page does not leak document-route URLs through Referer headers"],
  ["network allowlist", forbiddenSinks === 0 && externalFetches === 1 && failures.filter((x) => x.includes("external fetch") || x.includes("network sink")).length === 0, "only the explicit OCR language-pack download uses a cross-origin fetch"],
  ["project-package passwords", /userPassword:\s*""/.test(packageSource) && /ownerPassword:\s*""/.test(packageSource), "project backups blank PDF passwords"],
  ["security-state passwords", /userPassword:\s*""/.test(securityRepo) && /ownerPassword:\s*""/.test(securityRepo), "persisted security state blanks PDF passwords"],
  ["support bundle scope", !/loadProjectBytes|pdfBytes|ocrPages|editorState/.test(maintenance) && /\[filename omitted\]/.test(maintenance), "support bundles do not load project content and omit filenames by default"],
  ["runtime origin audit", /externalResources/.test(releaseValidation) && /OCR language downloads are the only expected optional network activity/.test(releaseValidation), "release validation reports unexpected cross-origin resources"],
  ["password sink scan", riskyPersistence === 0, "no unapproved password-adjacent persistence sink was found"]
];
for (const [name, passed, detail] of checks) {
  findings.push({ name, passed: Boolean(passed), detail });
  if (!passed) failures.push(`${name}: ${detail}`);
}
for (const item of findings) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
if (failures.length) {
  console.error("Phase 30 security/privacy failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
console.log(`Phase 30 security/privacy audit: ${findings.filter((x) => x.passed).length}/${findings.length} passed.`);
