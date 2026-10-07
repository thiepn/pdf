import { describe, expect, it } from "vitest";
// @ts-ignore -- test-only Node .mjs evidence module; runtime behavior is the target.
import { P18_BUILD_CHANNEL, P18_PRODUCT_BASELINE, REAL_WORLD_CATEGORIES, summarizeQualification, validateDeviceRun } from "../../scripts/p18/qualification-evidence.mjs"

const hash=(char:string) => char.repeat(64);

function realCases(): any[] {
  return (REAL_WORLD_CATEGORIES as string[]).map((category:string,index:number) => ({
    schema:1,
    baseline_commit:P18_PRODUCT_BASELINE,
    case_id:`rw-case-${index + 1}`,
    evidence_source:"human-real-world-document",
    human_attestation:true,
    privacy_attestation:true,
    content_committed:false,
    origin_class:"public",
    source_sha256:hash(String((index % 9) + 1)),
    byte_size:1000 + index,
    page_count:category === "malformed" ? 0 : 2,
    categories:[category],
    product_result:"PASS",
    defects:[]
  }));
}

function checks(kind:"pdf"|"docx") {
  const ids=kind === "docx" ? ["open","editable-structure","content","workflow-specific"] : ["open","render","content","workflow-specific"];
  return ids.map((id) => ({id,result:"PASS"}));
}

function external(workflow_id:string,family:string,source_case_id:string,index:number): any {
  const kind=workflow_id === "W01" ? "docx" : "pdf";
  return {
    schema:1,
    baseline_commit:P18_PRODUCT_BASELINE,
    run_id:`reader-${workflow_id.toLowerCase()}-${index}`,
    evidence_source:"human-external-application",
    human_attestation:true,
    automation_used_for_observation:false,
    source_case_id,
    artifact:{workflow_id,kind,sha256:hash(String((index % 8)+1)),byte_size:5000+index,...(kind==="pdf"?{page_count:2}:{})},
    application:{
      family,
      name:family === "microsoft-word" ? "Microsoft Word" : family === "adobe-acrobat" ? "Adobe Acrobat Reader" : "Preview",
      version:"1.2.3",
      os_family:family === "macos-preview" ? "macos" : "windows",
      os_version:"15.1"
    },
    checks:checks(kind),
    defects:[]
  };
}

function workflow(id:string,result="PASS",caseId="rw-case-1",index=1): any {
  const produced = result === "PASS" || result === "PASS WITH EXPECTED LIMITATION" || result === "FAIL";
  return {
    id,
    workflow:id,
    result,
    source_case_id:id === "W06" || result === "NOT_RUN" ? null : caseId,
    artifact_sha256:id === "W06" || !produced ? null : hash(String((index % 8)+1))
  };
}

function device(run_id:string,device_class:"phone"|"tablet",app_mode:"browser"|"installed-pwa",results:any[]): any {
  return {
    schema:1,
    baseline_commit:P18_PRODUCT_BASELINE,
    run_id,
    tester_id:`anon-${run_id}`,
    evidence_source:"human-physical-device",
    human_attestation:true,
    physical_device:true,
    simulator_or_emulator:false,
    automation_used_for_observation:false,
    environment:{
      date:"2026-10-07",
      device_class,
      device_model:device_class === "phone" ? "Reference Phone" : "Reference Tablet",
      os_family:device_class === "phone" ? "android" : "ipados",
      os_version:"18.1",
      browser_family:device_class === "phone" ? "chromium" : "safari-webkit",
      browser_name:device_class === "phone" ? "Chrome" : "Safari",
      browser_version:"140.1",
      input_mode:"touch",
      viewport:device_class === "phone" ? "390x844" : "834x1112",
      app_mode,
      build_channel:P18_BUILD_CHANNEL,
      release_integrity_sha256:hash("a")
    },
    workflow_results:results,
    defects:[]
  };
}

describe("P18 compatibility and human/device qualification", () => {
  it("starts honestly unmeasured with no committed human evidence", () => {
    const summary=summarizeQualification({});
    expect(summary.realWorld.status).toBe("REAL_WORLD_UNMEASURED");
    expect(summary.externalReaders.status).toBe("EXTERNAL_READER_UNMEASURED");
    expect(summary.physicalDevices.status).toBe("PHYSICAL_DEVICE_UNMEASURED");
    expect(summary.certificationStatus).toBe("NOT_QUALIFIED");
  });

  it("can derive a fully qualified state only when all evidence layers satisfy their matrices", () => {
    const cases=realCases();
    const externalRuns=[
      external("W01","microsoft-word","rw-case-2",1),
      external("W02","adobe-acrobat","rw-case-6",2),
      external("W03","macos-preview","rw-case-7",3),
      external("W04","adobe-acrobat","rw-case-4",4),
      external("W05","macos-preview","rw-case-3",5)
    ];
    const phone=device("phone-1","phone","installed-pwa",[
      workflow("W01","PASS","rw-case-2",1),
      workflow("W02","PASS","rw-case-6",2),
      workflow("W03","PASS","rw-case-7",3),
      workflow("W04","NOT_RUN","rw-case-4",4),
      workflow("W05","NOT_RUN","rw-case-3",5),
      workflow("W06","PASS")
    ]);
    const tablet=device("tablet-1","tablet","browser",[
      workflow("W01","NOT_RUN","rw-case-2",1),
      workflow("W02","NOT_RUN","rw-case-6",2),
      workflow("W03","NOT_RUN","rw-case-7",3),
      workflow("W04","PASS","rw-case-4",4),
      workflow("W05","PASS WITH EXPECTED LIMITATION","rw-case-3",5),
      workflow("W06","NOT_RUN")
    ]);
    const summary=summarizeQualification({cases,externalRuns,deviceRuns:[phone,tablet]});
    expect(summary.realWorld.status).toBe("REAL_WORLD_TARGET_MET");
    expect(summary.externalReaders.status).toBe("EXTERNAL_READER_TARGET_MET");
    expect(summary.externalReaders.distinctPdfReaderFamilies).toBe(2);
    expect(summary.physicalDevices.status).toBe("PHYSICAL_DEVICE_TARGET_MET");
    expect(summary.certificationStatus).toBe("P18_V72_QUALIFIED");
  });

  it("rejects emulated or automated physical-device claims", () => {
    const run=device("phone-bad","phone","installed-pwa",[
      workflow("W01"),workflow("W02"),workflow("W03"),workflow("W04"),workflow("W05"),workflow("W06")
    ]);
    run.simulator_or_emulator=true;
    expect(() => validateDeviceRun(run)).toThrow(/simulator_or_emulator must be false/);
  });

  it("does not count a registered real-world category until product handling is actually observed", () => {
    const cases=realCases();
    cases.find((item) => item.categories.includes("signed")).product_result="NOT_RUN";
    const summary=summarizeQualification({cases,externalRuns:[],deviceRuns:[]});
    expect(summary.realWorld.status).toBe("REAL_WORLD_INCOMPLETE");
    expect(summary.realWorld.missingCategories).toContain("signed");
  });

  it("blocks on a failed real-world product observation", () => {
    const cases=realCases();
    cases[0].product_result="FAIL";
    const summary=summarizeQualification({cases,externalRuns:[],deviceRuns:[]});
    expect(summary.realWorld.status).toBe("REAL_WORLD_BLOCKED");
    expect(summary.certificationStatus).toBe("NOT_QUALIFIED");
  });

  it("blocks certification for an unresolved compatibility defect even when coverage otherwise passes", () => {
    const cases=realCases();
    const externalRuns=[
      external("W01","microsoft-word","rw-case-2",1),
      external("W02","adobe-acrobat","rw-case-6",2),
      external("W03","macos-preview","rw-case-7",3),
      external("W04","adobe-acrobat","rw-case-4",4),
      external("W05","macos-preview","rw-case-3",5)
    ];
    externalRuns[4].defects=[{issue:"#999",severity:"medium",category:"compatibility",status:"open"}];
    const summary=summarizeQualification({cases,externalRuns,deviceRuns:[]});
    expect(summary.externalReaders.status).toBe("EXTERNAL_READER_BLOCKED");
    expect(summary.certificationStatus).toBe("NOT_QUALIFIED");
  });
});
