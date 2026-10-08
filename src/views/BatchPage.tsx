import { useEffect, useRef, useState } from "react";
import { listBatchRecipes, saveBatchRecipe } from "../processing/batchRepository";
import { batchStepLabel, defaultBatchStep, runBatchRecipe } from "../processing/batchPipeline";
import { batchRecipeExecutionFingerprint, parseBatchRecipeJson, serializeBatchRecipe } from "../processing/batchModel";
import { downloadBlob } from "../projects/download";
import { BATCH_RECIPE_SCHEMA_VERSION, type BatchItemStatus, type BatchRecipe, type BatchStep } from "../types/batch";
import { WorkflowComposer } from "../automation/WorkflowComposer";
import { F6_MAX_FILES, createWorkflowRunEvidence, validateWorkflowDraft, type WorkflowFailurePolicy, type WorkflowRunEvidence } from "../automation/workflowComposerModel";
import { createStoredZip } from "../toolbox/zip";

interface BatchItem { id: string; file: File; status: BatchItemStatus; progress: number; message: string; output?: Uint8Array; outputExtension?: ".pdf" | ".zip"; outputRecipeFingerprint?: string; outputMime?: string; error?: string }
const DEFAULT_RECIPE: BatchRecipe = { schemaVersion: BATCH_RECIPE_SCHEMA_VERSION, id: "current", name: "Document cleanup", steps: [{ id: "optimize-default", type: "optimize" }], outputSuffix: "processed", updatedAt: Date.now() };
export function BatchPage() {
  const inputRef=useRef<HTMLInputElement|null>(null),recipeInputRef=useRef<HTMLInputElement|null>(null),abortRef=useRef<AbortController|null>(null),pauseRef=useRef(false);
  const [items,setItems]=useState<BatchItem[]>([]),[recipe,setRecipe]=useState<BatchRecipe>(DEFAULT_RECIPE),[recipes,setRecipes]=useState<BatchRecipe[]>([]);
  const [running,setRunning]=useState(false),[paused,setPaused]=useState(false),[error,setError]=useState<string|null>(null);
  const [failurePolicy,setFailurePolicy]=useState<WorkflowFailurePolicy>("continue");
  const [approvalFingerprint,setApprovalFingerprint]=useState<string | null>(null);
  const [lastRunEvidence,setLastRunEvidence]=useState<WorkflowRunEvidence|null>(null);
  const recipeLocked = running || paused;
  const recipeFingerprint = batchRecipeExecutionFingerprint(recipe);
  const preflight = validateWorkflowDraft(recipe);
  const approvalRequired = preflight.risks.length > 0;
  const approvalValid = !approvalRequired || approvalFingerprint === recipeFingerprint;
  const readyToRun = preflight.valid && approvalValid;
  const hasCurrentOutput = (item: BatchItem) => Boolean(item.output && item.outputRecipeFingerprint === recipeFingerprint);
  const needsRun = (item: BatchItem) => !hasCurrentOutput(item) || item.status !== "complete";
  const currentOutputFilename = (item: BatchItem) => `${item.file.name.replace(/\.pdf$/i,"")}-${recipe.outputSuffix||"processed"}${item.outputExtension||".pdf"}`;
  useEffect(()=>{void listBatchRecipes().then(setRecipes);},[]);
  function addFiles(files:FileList|File[]){const accepted=[...files].filter(file=>file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf"));if(items.length+accepted.length>F6_MAX_FILES){setError("A single queue can hold at most 100 PDF files.");return;}setItems(current=>[...current,...accepted.map(file=>({id:crypto.randomUUID(),file,status:"pending" as const,progress:0,message:"Queued"}))]);setLastRunEvidence(null);}
  function patch(id:string,value:Partial<BatchItem>){setItems(current=>current.map(item=>item.id===id?{...item,...value}:item));}
  function patchStep(id:string,value:Partial<BatchStep>){setRecipe(current=>({...current,steps:current.steps.map(step=>step.id===id?{...step,...value} as BatchStep:step)}));}
  async function run(){
    if(!preflight.valid){setError(preflight.errors.join(" "));return;}
    if(!approvalValid){setError("Review and approve the destructive workflow effects before running.");return;}
    if(!recipe.steps.length){setError("Add at least one workflow step.");return;}
    const recipeSnapshot=structuredClone(recipe),runFingerprint=batchRecipeExecutionFingerprint(recipeSnapshot);
    if(!items.some(item=>!item.output||item.outputRecipeFingerprint!==runFingerprint||item.status!=="complete"))return;
    const startedAt=new Date().toISOString();
    const entries:WorkflowRunEvidence["entries"]=[];
    setLastRunEvidence(null);setRunning(true);setPaused(false);setError(null);pauseRef.current=false;
    for(const item of items){
      if(pauseRef.current){setPaused(true);break;}
      if(item.output&&item.outputRecipeFingerprint===runFingerprint&&item.status==="complete")continue;
      const controller=new AbortController();abortRef.current=controller;
      patch(item.id,{status:"running",progress:.01,message:"Opening…",error:undefined,output:undefined,outputExtension:undefined,outputRecipeFingerprint:undefined,outputMime:undefined});
      try{
        const source=new Uint8Array(await item.file.arrayBuffer());
        const artifact=await runBatchRecipe(source,recipeSnapshot,controller.signal,(progress,message)=>patch(item.id,{progress:Math.max(.01,Math.min(.98,progress)),message}));
        patch(item.id,{status:"complete",progress:1,message:`${(artifact.bytes.byteLength/1_000_000).toFixed(2)} MB · Ready`,output:artifact.bytes,outputExtension:artifact.extension,outputRecipeFingerprint:runFingerprint,outputMime:artifact.mimeType});
        entries.push({name:item.file.name,status:"complete",bytesIn:source.byteLength,bytesOut:artifact.bytes.byteLength});
      }catch(reason){
        const cancelled=controller.signal.aborted || (reason instanceof DOMException&&reason.name==="AbortError");
        const message=reason instanceof Error?reason.message:String(reason);
        patch(item.id,{status:cancelled?"cancelled":"failed",message:cancelled?"Cancelled":"Failed",error:cancelled?undefined:message});
        entries.push({name:item.file.name,status:cancelled?"cancelled":"failed",bytesIn:item.file.size,bytesOut:null,...(cancelled?{}:{error:message})});
        if(failurePolicy==="stop" || cancelled)break;
      }
    }
    abortRef.current=null;setRunning(false);
    setLastRunEvidence(createWorkflowRunEvidence({recipeName:recipeSnapshot.name,fingerprint:runFingerprint,failurePolicy,startedAt,completedAt:new Date().toISOString(),entries}));
  }
  async function saveRecipe(){if(!preflight.valid){setError(preflight.errors.join(" "));return;}const saved={...recipe,id:recipe.id==="current"?crypto.randomUUID():recipe.id,updatedAt:Date.now()};await saveBatchRecipe(saved);setRecipe(saved);setRecipes(await listBatchRecipes());}
  function exportRecipe(){const blob=new Blob([serializeBatchRecipe(recipe)],{type:"application/json;charset=utf-8"});downloadBlob(blob,`${(recipe.name||"batch-recipe").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"batch-recipe"}.lpsrecipe.json`);}
  async function importRecipe(file:File){setError(null);try{const imported=parseBatchRecipeJson(await file.text());const validation=validateWorkflowDraft(imported);if(!validation.valid)throw new Error(validation.errors.join(" "));setRecipe(imported);setApprovalFingerprint(null);await saveBatchRecipe(imported);setRecipes(await listBatchRecipes());}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}}
  function downloadReport(){
    if(!lastRunEvidence)return;
    const payload=new Blob([JSON.stringify(lastRunEvidence,null,2)],{type:"application/json;charset=utf-8"});
    downloadBlob(payload,`workflow-run-${lastRunEvidence.startedAt.slice(0,19).replace(/[:T]/g,"-")}.json`);
  }
  function downloadAll(){const outputs=items.filter((item):item is BatchItem & {output:Uint8Array}=>hasCurrentOutput(item));if(!outputs.length)return;const zip=createStoredZip(outputs.map((item,index)=>({name:`${String(index+1).padStart(3,"0")}-${currentOutputFilename(item)}`,bytes:item.output})));downloadBlob(new Blob([Uint8Array.from(zip).buffer],{type:"application/zip"}),"batch-outputs.zip");} 
  return <div className="batch-page batch-page--f6"><section className="tools-hero"><p className="eyebrow">PDF STUDIO / AUTOMATION</p><h2>Visual workflow composer</h2><p>Build an ordered action sequence, review potential content changes, then process your PDFs locally. Save or export the sequence for reuse.</p></section>{error?<div className="error-banner"><strong>Batch issue</strong><span>{error}</span></div>:null}<div className="batch-layout"><aside className="batch-recipe">
    <div className="batch-recipe__bar">
      <label>Workflow name<input disabled={recipeLocked} value={recipe.name} onChange={event=>setRecipe(current=>({...current,name:event.target.value}))}/></label>
      <label>Output suffix<input disabled={recipeLocked} value={recipe.outputSuffix} onChange={event=>setRecipe(current=>({...current,outputSuffix:event.target.value.replace(/[^a-zA-Z0-9_-]/g,"")}))}/></label>
      {recipes.length?<label>Saved workflows<select disabled={recipeLocked} value={recipes.some(entry=>entry.id===recipe.id)?recipe.id:""} onChange={event=>{const selected=recipes.find(entry=>entry.id===event.target.value);if(selected){setRecipe(selected);setApprovalFingerprint(null);}}}><option value="">Select…</option>{recipes.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>:null}
      <div className="batch-recipe-actions">
        <button className="button button--secondary" disabled={recipeLocked||!preflight.valid} onClick={()=>void saveRecipe()} type="button">Save workflow</button>
        <button className="button button--ghost" disabled={recipeLocked||!preflight.valid} onClick={exportRecipe} type="button">Export workflow</button>
        <button className="button button--ghost" disabled={recipeLocked} onClick={()=>recipeInputRef.current?.click()} type="button">Import workflow</button>
        <input ref={recipeInputRef} hidden accept="application/json,.json" type="file" onChange={event=>{const file=event.target.files?.[0];if(file)void importRecipe(file);event.target.value="";}}/>
      </div>
    </div>
    <WorkflowComposer steps={recipe.steps} disabled={recipeLocked} onChange={steps=>{setError(null);setRecipe(current=>({...current,steps}));}} onError={setError}
      renderParameters={step=><StepEditor step={step} disabled={recipeLocked} patch={value=>patchStep(step.id,value)}/>} />
    <section className={`f6-preflight${preflight.valid?"":" f6-preflight--invalid"}`} aria-label="Workflow preflight">
      <h4>Execution preview</h4>
      {preflight.valid?<p>{preflight.plan?.actions.length} action(s) in order. Output: <strong>{preflight.terminal?"ZIP archive":"PDF document"}</strong>. Processing runs locally, one file at a time.</p>:<ul>{preflight.errors.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}
      {preflight.warnings.length?<ul>{preflight.warnings.map((message,index)=><li key={index}>{message}</li>)}</ul>:<p>No destructive effects were identified by the action registry. Check outputs before distribution.</p>}
      <div className="f6-run-controls">
        <label>On file error <select aria-label="On file error" disabled={recipeLocked} value={failurePolicy} onChange={event=>setFailurePolicy(event.target.value as WorkflowFailurePolicy)}><option value="continue">Continue to next PDF</option><option value="stop">Stop the queue</option></select></label>
        {approvalRequired?<label className="f6-confirm"><input type="checkbox" checked={approvalValid} disabled={recipeLocked||!preflight.valid} onChange={event=>setApprovalFingerprint(event.target.checked?recipeFingerprint:null)}/><span>I reviewed the {preflight.risks.map(risk=>risk==="metadata-removal"?"metadata removal":"rasterization").join(" and ")} effects and authorize them for this workflow.</span></label>:null}
      </div>
    </section>
  </aside><main className="batch-queue"><div className="batch-toolbar"><button className="button" disabled={running} onClick={()=>inputRef.current?.click()} type="button">Add PDFs</button><input ref={inputRef} accept="application/pdf,.pdf" hidden multiple type="file" onChange={event=>{if(event.target.files)addFiles(event.target.files);event.target.value="";}}/><button className="button button--secondary" disabled={running||!items.length} onClick={()=>{setItems([]);setPaused(false);pauseRef.current=false;}} type="button">Clear</button><button className="button button--secondary" disabled={running||!items.some(hasCurrentOutput)} onClick={downloadAll} type="button">Download all ZIP</button><button className="button button--secondary" disabled={running||!lastRunEvidence} onClick={downloadReport} type="button">Download run report</button><span>{items.length} file(s)</span></div>{lastRunEvidence?<div className="f6-queue-summary" role="status"><span><b>{lastRunEvidence.succeeded}</b> complete</span><span><b>{lastRunEvidence.failed}</b> failed</span><span><b>{lastRunEvidence.cancelled}</b> cancelled</span><span>Report available as JSON</span></div>:null}<div className="batch-items">{items.map(item=><article className={`batch-item batch-item--${item.status}`} key={item.id}><div><strong>{item.file.name}</strong><span>{(item.file.size/1_000_000).toFixed(2)} MB</span></div><div><span>{item.output&&!hasCurrentOutput(item)?"Workflow changed · Run again":item.message}</span><progress max="1" value={item.output&&!hasCurrentOutput(item)?0:item.progress}/></div>{item.error?<p>{item.error}</p>:null}<div className="batch-item__actions">{hasCurrentOutput(item)?<button className="button button--tiny" onClick={()=>downloadBlob(new Blob([Uint8Array.from(item.output!).buffer],{type:item.outputMime||"application/pdf"}),currentOutputFilename(item))} type="button">Download</button>:null}<button className="button button--tiny button--ghost" disabled={running} onClick={()=>setItems(current=>current.filter(entry=>entry.id!==item.id))} type="button">Remove</button></div></article>)}</div>{!items.length?<div className="empty-state"><strong>No PDFs added yet</strong><p>Add files, choose your workflow, then start processing.</p></div>:null}<footer className="batch-runbar"><button className="button" disabled={running||!items.some(needsRun)||!readyToRun} onClick={()=>void run()} type="button">{paused?"Resume":"Run workflow"}</button>{paused&&!running?<button className="button button--secondary" onClick={()=>setPaused(false)} type="button">Stop</button>:null}{running?<><button className="button button--secondary" onClick={()=>{pauseRef.current=true;}} type="button">Pause after current</button><button className="button button--ghost" onClick={()=>abortRef.current?.abort()} type="button">Cancel current</button></>:null}</footer></main></div></div>;
}

function StepEditor({step,disabled,patch}:{step:BatchStep;disabled:boolean;patch:(value:Partial<BatchStep>)=>void}){
  if(step.type==="rotate")return <label>Degrees<select disabled={disabled} value={step.degrees} onChange={event=>patch({degrees:Number(event.target.value) as 90|180|270})}><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>;
  if(step.type==="crop")return <div className="batch-step-grid">{(["topMm","rightMm","bottomMm","leftMm"] as const).map(key=><label key={key}>{key.replace("Mm","")} (mm)<input disabled={disabled} min="0" type="number" value={step[key]} onChange={event=>patch({[key]:Math.max(0,Number(event.target.value))} as Partial<BatchStep>)}/></label>)}</div>;
  if(step.type==="decorate")return <div className="batch-step-grid"><label>Watermark<input disabled={disabled} value={step.watermarkText} onChange={event=>patch({watermarkText:event.target.value})}/></label><label>Header<input disabled={disabled} value={step.headerText} onChange={event=>patch({headerText:event.target.value})}/></label><label>Footer<input disabled={disabled} value={step.footerText} onChange={event=>patch({footerText:event.target.value})}/></label><label className="check-row"><input disabled={disabled} checked={step.pageNumbers} type="checkbox" onChange={event=>patch({pageNumbers:event.target.checked})}/> Page numbers</label><label>Start<input disabled={disabled} type="number" value={step.startNumber} onChange={event=>patch({startNumber:Number(event.target.value)})}/></label><label>Script<select disabled={disabled} value={step.fontLanguage ?? "auto"} onChange={event=>patch({fontLanguage:event.target.value as "auto"|"ko"|"ja"|"zh-Hans"|"zh-Hant"})}><option value="auto">Auto</option><option value="ko">Korean</option><option value="ja">Japanese</option><option value="zh-Hans">Chinese · Simplified</option><option value="zh-Hant">Chinese · Traditional</option></select></label></div>;
  if(step.type==="blank-pages")return <div className="batch-step-grid"><label>Position<select disabled={disabled} value={step.position} onChange={event=>patch({position:event.target.value as "start"|"end"})}><option value="start">Start</option><option value="end">End</option></select></label><label>Count<input disabled={disabled} min="1" max="20" type="number" value={step.count} onChange={event=>patch({count:Number(event.target.value)})}/></label><label>Width (mm)<input disabled={disabled} min="25" type="number" value={step.widthMm} onChange={event=>patch({widthMm:Number(event.target.value)})}/></label><label>Height (mm)<input disabled={disabled} min="25" type="number" value={step.heightMm} onChange={event=>patch({heightMm:Number(event.target.value)})}/></label></div>;
  if(step.type==="raster-compress")return <label>Profile<select disabled={disabled} value={step.profile} onChange={event=>patch({profile:event.target.value as "screen"|"balanced"|"small"|"print"} as Partial<BatchStep>)}><option value="screen">Screen</option><option value="balanced">Balanced</option><option value="small">Small</option><option value="print">Print</option></select></label>;
  if(step.type==="grayscale")return <label>Profile<select disabled={disabled} value={step.profile} onChange={event=>patch({profile:event.target.value as "screen"|"balanced"|"print"} as Partial<BatchStep>)}><option value="screen">Screen</option><option value="balanced">Balanced</option><option value="print">Print</option></select><small>Converts pages to images, so searchable and interactive PDF features are removed.</small></label>;
  if(step.type==="split-fixed")return <label>Pages per PDF<input disabled={disabled} min="1" max="500" type="number" value={step.pagesPerFile} onChange={event=>patch({pagesPerFile:Math.max(1,Math.min(500,Math.round(Number(event.target.value))))} as Partial<BatchStep>)}/><small>Terminal step · produces a ZIP of PDF parts.</small></label>;
  if(step.type==="page-images")return <label>Image quality<select disabled={disabled} value={step.quality} onChange={event=>patch({quality:event.target.value as "compact"|"balanced"|"high"} as Partial<BatchStep>)}><option value="compact">Compact</option><option value="balanced">Balanced</option><option value="high">High</option></select><small>Terminal step · produces a ZIP of PNG pages.</small></label>;
  return <p className="muted">No additional settings.</p>;
}
