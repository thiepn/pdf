import { readFile } from "node:fs/promises";

const read=(path)=>readFile(path,"utf8");
const [
  manifestText, corpusText, statusText, intakeText, packageText, lockText, releaseSource,
  nativeTypes, validator, certifier, unitTest, productDoc, realTemplate, readerTemplate,
  deviceTemplate, fieldHostText, ciWorkflow, pagesWorkflow, p45Workflow, runbook,
  prepareRealWorld, prepareReader, prepareDevice, readme, limitations, changelog
]=await Promise.all([
  read("docs/p18/qualification.json"),
  read("docs/p18/corpus-matrix.json"),
  read("docs/p18/status.json"),
  read("docs/p12/feature-intake.json"),
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("src/types/nativeEditor.ts"),
  read("scripts/p18/qualification-evidence.mjs"),
  read("scripts/p18/certify.mjs"),
  read("tests/unit/p18Qualification.test.ts"),
  read("docs/product/P18_COMPATIBILITY_HUMAN_DEVICE_QUALIFICATION.md"),
  read("docs/p18/real-world-case-template.json"),
  read("docs/p18/external-reader-run-template.json"),
  read("docs/p18/device-run-template.json"),
  read("docs/p18/field-host.json"),
  read(".github/workflows/p18-compatibility-qualification-ci.yml"),
  read(".github/workflows/p18-qualification-pages.yml"),
  read(".github/workflows/p45-qualification-pages.yml"),
  read("docs/p18/FIELD_RUNBOOK.md"),
  read("scripts/p18/prepare-real-world-case.mjs"),
  read("scripts/p18/prepare-external-reader-run.mjs"),
  read("scripts/p18/prepare-device-run.mjs"),
  read("README.md"),
  read("KNOWN_LIMITATIONS.md"),
  read("CHANGELOG.md")
]);

const manifest=JSON.parse(manifestText);
const corpus=JSON.parse(corpusText);
const status=JSON.parse(statusText);
const fieldHost=JSON.parse(fieldHostText);
const intake=JSON.parse(intakeText);
const pkg=JSON.parse(packageText);
const lock=JSON.parse(lockText);
const checks=[];
const check=(value,name)=>{const passed=Boolean(value);checks.push({name,passed});if(!passed)throw new Error(`P18 qualification audit failed: ${name}`);};

check(manifest.schemaVersion===1&&manifest.phase==="P18"&&manifest.roadmapItem==="V72-06","manifest identifies P18 / V72-06");
check(manifest.status==="FRAMEWORK_READY_EVIDENCE_PENDING","framework does not fabricate completed field evidence");
check(manifest.productBaseline?.commit==="741c36d599be5fca138e7cdfdcc132c8ef74db1d"&&manifest.productBaseline?.sourcePhase==="P17","P18 freezes the exact P17 product baseline");
check(manifest.stableRoot?.version==="7.1.4"&&manifest.stableRoot?.commit==="2116a61b73b6fdb18aa19a8175d9ebae4b43c159","qualification records current Stable v7.1.4 identity");
check(manifest.releaseBoundary?.versionCutAllowed===false&&manifest.releaseBoundary?.productNetworkDependency===false,"P18 cannot cut version or add a product network dependency");
check(JSON.stringify(manifest.releaseBoundary?.persistentFormats)===JSON.stringify({projectPackageVersion:9,databaseSchemaVersion:13,nativeEditorSchemaVersion:6}),"persistent schemas remain 9/13/6");
check(pkg.version==="7.1.4"&&lock.version==="7.1.4"&&lock.packages?.[""]?.version==="7.1.4","package identity remains v7.1.4");
check(releaseSource.includes('APP_VERSION = "7.1.4"'),"APP_VERSION remains v7.1.4");
check(/NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*6/.test(nativeTypes),"native editor schema remains v6");

const item=intake.items?.find((entry)=>entry.id==="V72-06");
check(item?.disposition==="committed"&&/human\/device qualification/i.test(item?.title??""),"P18 implements committed V72-06");
check((manifest.realWorld?.requiredCategories??[]).join(",")==="malformed,scanned,form-heavy,encrypted,signed,multilingual,large","all required real-world categories are explicit");
check(corpus.realWorldEvidenceRequiredForAllCategories===true&&corpus.automatedEvidence?.some((entry)=>entry.category==="signed"&&/No genuine signed-PDF/.test(entry.limitation??"")),"signed real-world evidence cannot be replaced by a generated fixture");
check(manifest.automation?.neverCountsAsHumanOrPhysicalDeviceEvidence===true,"automation cannot satisfy human/device qualification");
check((manifest.externalApplications?.requiredWorkflowIds??[]).join(",")==="W01,W02,W03,W04,W05","all output workflows require external reopen evidence");
check(manifest.externalApplications?.exactOutputSha256Required===true&&manifest.externalApplications?.minimumDistinctPdfReaderFamilies===2,"external readers require exact output identity and independent-reader diversity");
check((manifest.physicalDevices?.requiredSlots??[]).join(",")==="physical-phone,physical-tablet,installed-pwa","phone/tablet/PWA slots are mandatory");
check((manifest.physicalDevices?.requiredWorkflowIds??[]).join(",")==="W01,W02,W03,W04,W05,W06","physical evidence covers every affected workflow plus PWA recovery");

check(validator.includes("human-real-world-document")&&validator.includes("human-external-application")&&validator.includes("human-physical-device"),"validator separates the three human evidence layers");
check(validator.includes("AUTOMATION_MARKERS")&&validator.includes("automation_used_for_observation === false")&&validator.includes("simulator_or_emulator === false"),"validator rejects automation/emulation as human evidence");
check(validator.includes("source_sha256")&&validator.includes("artifact.sha256")&&validator.includes("release_integrity_sha256"),"source, output and build identities are all hash-bound");
check(validator.includes("REAL_WORLD_BLOCKED")&&validator.includes("EXTERNAL_READER_BLOCKED")&&validator.includes("PHYSICAL_DEVICE_BLOCKED")&&validator.includes("P18_V72_QUALIFIED"),"blocking and certification states are explicit");
check(certifier.includes('summary.certificationStatus !== "P18_V72_QUALIFIED"'),"certifier fails closed until evidence qualifies");
check(pkg.scripts?.["check:p18"]?.includes("audit:p18:field-host")&&pkg.scripts?.["status:p18"]&&pkg.scripts?.["certify:p18"],"package scripts expose framework, status, host and certification gates");
check(fieldHost.product_baseline_commit==="741c36d599be5fca138e7cdfdcc132c8ef74db1d"&&fieldHost.stable_tag_commit==="2116a61b73b6fdb18aa19a8175d9ebae4b43c159","field host binds exact P17 and Stable commits");
check(fieldHost.qualification_path==="qualification/v72-p18"&&fieldHost.fieldwork_state==="OPEN_NO_EVIDENCE"&&fieldHost.active===true,"field host starts active with honest no-evidence state");
check(ciWorkflow.includes("Prove P18 is qualification-only")&&ciWorkflow.includes("test:corpus:phase28")&&ciWorkflow.includes("desktop-browser-matrix")&&ciWorkflow.includes("emulated-mobile-regression"),"P18 CI covers source freeze, adversarial corpus and browser matrices");
check(ciWorkflow.includes("Emulation is automation evidence only")&&ciWorkflow.includes("P18_PRODUCT_BASELINE"),"P18 CI preserves the anti-synthesis and frozen-baseline boundary");
check(pagesWorkflow.includes("Prove Stable root equals live root")&&pagesWorkflow.includes("qualification/v72-p18")===false&&pagesWorkflow.includes("P18_PATH"),"P18 Pages host preserves Stable root and uses configured qualification path");
check(pagesWorkflow.includes("P45_ACTIVE")&&pagesWorkflow.includes("P45_PATH"),"P18 Pages composition preserves an active P45 qualification subtree");
check(p45Workflow.includes("group: qualification-pages")&&pagesWorkflow.includes("group: qualification-pages"),"P45 and P18 Pages deployments share one serialization group");
check(runbook.includes("/qualification/v72-p18/")&&runbook.includes("Do not pre-fill PASS")&&runbook.includes("Preserve failed evidence"),"field runbook pins host and preserves honest observations");
check(prepareRealWorld.includes("sha256File(file)")&&!prepareRealWorld.includes("source_path"),"real-world preparer hashes local sources without persisting paths");
check(prepareReader.includes("sha256File(artifactFile)")&&prepareReader.includes('result:"NOT_RUN"'),"external-reader preparer binds exact output and starts unmeasured");
check(prepareDevice.includes("sha256File(integrity)")&&prepareDevice.includes('result:"NOT_RUN"'),"device preparer binds qualification build integrity and starts unmeasured");
check(unitTest.includes("starts honestly unmeasured")&&unitTest.includes("registered real-world category")&&unitTest.includes("failed real-world product observation")&&unitTest.includes("rejects emulated or automated physical-device claims")&&unitTest.includes("unresolved compatibility defect"),"qualification logic has positive and fail-closed regressions");

check(status.real_world_status==="REAL_WORLD_UNMEASURED"&&status.external_reader_status==="EXTERNAL_READER_UNMEASURED"&&status.physical_device_status==="PHYSICAL_DEVICE_UNMEASURED"&&status.certification_status==="NOT_QUALIFIED","initial status is honestly unmeasured");
check(realTemplate.includes('"content_committed": false')&&realTemplate.includes('"product_result": "NOT_RUN"')&&readerTemplate.includes('"sha256": "REPLACE_WITH_64_LOWERCASE_HEX"')&&deviceTemplate.includes('"physical_device": true'),"field templates preserve privacy, exact identity and unmeasured defaults");
check(productDoc.includes("Automation never satisfies")&&productDoc.includes("Preserve failed evidence")&&productDoc.includes("P18_V72_QUALIFIED"),"human documentation states anti-synthesis and release-blocking rules");
check(readme.includes("P18 now establishes V72-06"),"README exposes P18 qualification framework");
check(limitations.includes("P18 qualification"),"known limitations preserve the manual evidence boundary");
check(changelog.includes("P18 — Compatibility & Human/Device Qualification"),"CHANGELOG records P18");
check(manifest.nextPhase?.id==="P19"&&manifest.nextPhase?.condition==="P18_V72_QUALIFIED","P19 is gated on completed P18 evidence");

console.log(JSON.stringify({phase:"P18",status:"P18_FRAMEWORK_PASS",passed:checks.filter((item)=>item.passed).length,total:checks.length,checks},null,2));
