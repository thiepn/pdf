import { useEffect, useRef, useState } from "react";
import { inspectPdfBytes } from "../engines/pdfjs";
import { listBatchRecipes, saveBatchRecipe } from "../processing/batchRepository";
import { batchStepLabel, defaultBatchStep, runBatchRecipe } from "../processing/batchPipeline";
import { batchRecipeExecutionFingerprint, parseBatchRecipeJson, serializeBatchRecipe, validateBatchRecipe } from "../processing/batchModel";
import { downloadBlob } from "../projects/download";
import { BATCH_RECIPE_SCHEMA_VERSION, type BatchItemStatus, type BatchRecipe, type BatchStep } from "../types/batch";
import { createStoredZip } from "../toolbox/zip";

interface BatchItem {
  id: string;
  file: File;
  inputIdentity: string;
  credentialRevision: number;
  hasSessionPassword: boolean;
  status: BatchItemStatus;
  progress: number;
  message: string;
  output?: Uint8Array;
  outputExtension?: ".pdf" | ".zip";
  outputRecipeFingerprint?: string;
  outputInputIdentity?: string;
  outputCredentialRevision?: number;
  outputMime?: string;
  warnings?: string[];
  terminalSummary?: string;
  error?: string;
}

const DEFAULT_RECIPE: BatchRecipe = {
  schemaVersion: BATCH_RECIPE_SCHEMA_VERSION,
  id: "current",
  name: "Document cleanup",
  steps: [{ id: "optimize-default", type: "optimize" }],
  outputSuffix: "processed",
  updatedAt: Date.now()
};

const STEP_TYPES: Array<{type:BatchStep["type"];label:string}> = [
  {type:"rotate",label:"Rotate pages"},
  {type:"optimize",label:"Compress without page images"},
  {type:"target-size",label:"Compress to target size"},
  {type:"remove-metadata",label:"Remove metadata"},
  {type:"crop",label:"Crop margins"},
  {type:"decorate",label:"Watermark / numbering"},
  {type:"blank-pages",label:"Insert blank pages"},
  {type:"extract-pages",label:"Extract pages"},
  {type:"remove-pages",label:"Remove pages"},
  {type:"flatten",label:"Flatten forms / annotations"},
  {type:"sanitize",label:"Clean risky content"},
  {type:"raster-compress",label:"Stronger image compression"},
  {type:"grayscale",label:"Grayscale PDF"},
  {type:"split-fixed",label:"Split into PDF parts"},
  {type:"page-images",label:"Export page images"}
];

function batchInputIdentity(file: File): string {
  return [file.name, file.size, file.lastModified, file.type].join("|");
}

function passwordError(reason: unknown): boolean {
  return /password|encrypted|authenticate/i.test(reason instanceof Error ? reason.message : String(reason));
}

export function BatchPage() {
  const inputRef=useRef<HTMLInputElement|null>(null);
  const recipeInputRef=useRef<HTMLInputElement|null>(null);
  const abortRef=useRef<AbortController|null>(null);
  const pauseRef=useRef(false);
  const sessionPasswordsRef=useRef<Map<string,string>>(new Map());

  const [items,setItems]=useState<BatchItem[]>([]);
  const [recipe,setRecipe]=useState<BatchRecipe>(DEFAULT_RECIPE);
  const [recipes,setRecipes]=useState<BatchRecipe[]>([]);
  const [running,setRunning]=useState(false);
  const [paused,setPaused]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [newStepType,setNewStepType]=useState<BatchStep["type"]>("rotate");
  const [passwordDrafts,setPasswordDrafts]=useState<Record<string,string>>({});
  const [credentialBusy,setCredentialBusy]=useState<string|null>(null);

  const recipeLocked = running || paused;
  const recipeFingerprint = batchRecipeExecutionFingerprint(recipe);
  const hasCurrentOutput = (item: BatchItem) => Boolean(
    item.output
    && item.outputRecipeFingerprint === recipeFingerprint
    && item.outputInputIdentity === item.inputIdentity
    && item.outputCredentialRevision === item.credentialRevision
  );
  const needsRun = (item: BatchItem) => !hasCurrentOutput(item) || item.status !== "complete";
  const currentOutputFilename = (item: BatchItem) => `${item.file.name.replace(/\.pdf$/i,"")}-${recipe.outputSuffix||"processed"}${item.outputExtension||".pdf"}`;

  useEffect(()=>{
    void listBatchRecipes().then(setRecipes);
    return () => {
      sessionPasswordsRef.current.clear();
    };
  },[]);

  function addFiles(files:FileList|File[]){
    const added=[...files]
      .filter(file=>file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf"))
      .map(file=>({
        id:crypto.randomUUID(),
        file,
        inputIdentity:batchInputIdentity(file),
        credentialRevision:0,
        hasSessionPassword:false,
        status:"pending" as const,
        progress:0,
        message:"Queued"
      }));
    setItems(current=>[...current,...added]);
  }

  function patch(id:string,value:Partial<BatchItem>){
    setItems(current=>current.map(item=>item.id===id?{...item,...value}:item));
  }

  function patchStep(id:string,value:Partial<BatchStep>){
    setRecipe(current=>({...current,steps:current.steps.map(step=>step.id===id?{...step,...value} as BatchStep:step)}));
  }

  const isTerminalStep=(step:BatchStep)=>step.type==="split-fixed"||step.type==="page-images";

  function appendStep(type:BatchStep["type"]){
    setRecipe(current=>{
      const next=defaultBatchStep(type);
      if(isTerminalStep(next))return{...current,steps:[...current.steps.filter(step=>!isTerminalStep(step)),next]};
      const terminalIndex=current.steps.findIndex(isTerminalStep);
      if(terminalIndex<0)return{...current,steps:[...current.steps,next]};
      const steps=[...current.steps];
      steps.splice(terminalIndex,0,next);
      return{...current,steps};
    });
  }

  function moveStep(index:number,direction:-1|1){
    setRecipe(current=>{
      const steps=[...current.steps],target=index+direction;
      if(target<0||target>=steps.length)return current;
      const moving=steps[index],other=steps[target];
      if(isTerminalStep(moving)&&target!==steps.length-1)return current;
      if(isTerminalStep(other)&&direction===1)return current;
      [steps[index],steps[target]]=[steps[target],steps[index]];
      return {...current,steps};
    });
  }

  function requirePassword(itemId:string, wrongPassword=false){
    sessionPasswordsRef.current.delete(itemId);
    setPasswordDrafts(current=>({...current,[itemId]:""}));
    setItems(current=>current.map(item=>item.id===itemId?{
      ...item,
      credentialRevision:item.credentialRevision+1,
      hasSessionPassword:false,
      status:"needs-password",
      progress:0,
      message:"Password required",
      error:wrongPassword?"That password did not open this PDF.":undefined,
      output:undefined,
      outputExtension:undefined,
      outputRecipeFingerprint:undefined,
      outputInputIdentity:undefined,
      outputCredentialRevision:undefined,
      outputMime:undefined,
      warnings:undefined,
      terminalSummary:undefined
    }:item));
  }

  async function useSessionPassword(item:BatchItem){
    const password=passwordDrafts[item.id]??"";
    if(!password){patch(item.id,{error:"Enter this PDF's password."});return;}
    setCredentialBusy(item.id);
    try{
      const bytes=new Uint8Array(await item.file.arrayBuffer());
      await inspectPdfBytes(bytes,password);
      sessionPasswordsRef.current.set(item.id,password);
      setPasswordDrafts(current=>({...current,[item.id]:""}));
      setItems(current=>current.map(entry=>entry.id===item.id?{
        ...entry,
        credentialRevision:entry.credentialRevision+1,
        hasSessionPassword:true,
        status:"pending",
        progress:0,
        message:"Password accepted · Ready",
        error:undefined,
        output:undefined,
        outputExtension:undefined,
        outputRecipeFingerprint:undefined,
        outputInputIdentity:undefined,
        outputCredentialRevision:undefined,
        outputMime:undefined,
        warnings:undefined,
        terminalSummary:undefined
      }:entry));
    }catch{
      requirePassword(item.id,true);
    }finally{
      setCredentialBusy(null);
    }
  }

  function forgetSessionPassword(item:BatchItem){
    sessionPasswordsRef.current.delete(item.id);
    setPasswordDrafts(current=>({...current,[item.id]:""}));
    setItems(current=>current.map(entry=>entry.id===item.id?{
      ...entry,
      credentialRevision:entry.credentialRevision+1,
      hasSessionPassword:false,
      status:"pending",
      progress:0,
      message:"Session password forgotten · Run again",
      error:undefined,
      output:undefined,
      outputExtension:undefined,
      outputRecipeFingerprint:undefined,
      outputInputIdentity:undefined,
      outputCredentialRevision:undefined,
      outputMime:undefined,
      warnings:undefined,
      terminalSummary:undefined
    }:entry));
  }

  async function run(){
    let recipeSnapshot: BatchRecipe;
    try { recipeSnapshot=validateBatchRecipe(structuredClone(recipe)); }
    catch(reason){ setError(reason instanceof Error?reason.message:String(reason)); return; }
    const runFingerprint=batchRecipeExecutionFingerprint(recipeSnapshot);
    if(!items.some(item=>!item.output||item.outputRecipeFingerprint!==runFingerprint||item.outputInputIdentity!==item.inputIdentity||item.outputCredentialRevision!==item.credentialRevision||item.status!=="complete"))return;
    setRunning(true);
    setPaused(false);
    setError(null);
    pauseRef.current=false;

    for(const item of items){
      if(pauseRef.current){setPaused(true);break;}
      if(
        item.output
        && item.outputRecipeFingerprint===runFingerprint
        && item.outputInputIdentity===item.inputIdentity
        && item.outputCredentialRevision===item.credentialRevision
        && item.status==="complete"
      )continue;

      const controller=new AbortController();
      abortRef.current=controller;
      patch(item.id,{
        status:"running",
        progress:.01,
        message:"Opening…",
        error:undefined,
        output:undefined,
        outputExtension:undefined,
        outputRecipeFingerprint:undefined,
        outputInputIdentity:undefined,
        outputCredentialRevision:undefined,
        outputMime:undefined,
        warnings:undefined,
        terminalSummary:undefined
      });

      try{
        const source=new Uint8Array(await item.file.arrayBuffer());
        const password=sessionPasswordsRef.current.get(item.id);
        const artifact=await runBatchRecipe(
          source,
          recipeSnapshot,
          controller.signal,
          (progress,message)=>patch(item.id,{progress:Math.max(.01,Math.min(.98,progress)),message}),
          password
        );
        patch(item.id,{
          status:"complete",
          progress:1,
          message:`${(artifact.bytes.byteLength/1_000_000).toFixed(2)} MB · Ready`,
          output:artifact.bytes,
          outputExtension:artifact.extension,
          outputRecipeFingerprint:runFingerprint,
          outputInputIdentity:item.inputIdentity,
          outputCredentialRevision:item.credentialRevision,
          outputMime:artifact.mimeType,
          warnings:artifact.warnings,
          terminalSummary:artifact.terminalSummary
        });
      }catch(reason){
        const cancelled=reason instanceof DOMException&&reason.name==="AbortError";
        if(!cancelled&&passwordError(reason)){
          requirePassword(item.id,Boolean(sessionPasswordsRef.current.get(item.id)));
          continue;
        }
        patch(item.id,{
          status:cancelled?"cancelled":"failed",
          message:cancelled?"Cancelled":"Failed",
          error:cancelled?undefined:reason instanceof Error?reason.message:String(reason)
        });
      }
    }

    abortRef.current=null;
    setRunning(false);
  }

  async function saveRecipe(){
    setError(null);
    try{
      const valid=validateBatchRecipe(structuredClone(recipe));
      const saved={...valid,id:valid.id==="current"?crypto.randomUUID():valid.id,updatedAt:Date.now()};
      await saveBatchRecipe(saved);
      setRecipe(saved);
      setRecipes(await listBatchRecipes());
    }catch(reason){
      setError(reason instanceof Error?reason.message:String(reason));
    }
  }

  function exportRecipe(){
    setError(null);
    try{
      const blob=new Blob([serializeBatchRecipe(recipe)],{type:"application/json;charset=utf-8"});
      downloadBlob(blob,`${(recipe.name||"batch-recipe").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"batch-recipe"}.lpsrecipe.json`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:String(reason));
    }
  }

  async function importRecipe(file:File){
    setError(null);
    try{
      const imported=parseBatchRecipeJson(await file.text());
      setRecipe(imported);
      await saveBatchRecipe(imported);
      setRecipes(await listBatchRecipes());
    }catch(reason){
      setError(reason instanceof Error?reason.message:String(reason));
    }
  }

  function clearQueue(){
    sessionPasswordsRef.current.clear();
    setPasswordDrafts({});
    setItems([]);
    setPaused(false);
    pauseRef.current=false;
  }

  function removeItem(item:BatchItem){
    sessionPasswordsRef.current.delete(item.id);
    setPasswordDrafts(current=>{
      const next={...current};
      delete next[item.id];
      return next;
    });
    setItems(current=>current.filter(entry=>entry.id!==item.id));
  }

  function downloadAll(){
    const outputs=items.filter((item):item is BatchItem & {output:Uint8Array}=>hasCurrentOutput(item));
    if(!outputs.length)return;
    const zip=createStoredZip(outputs.map((item,index)=>({
      name:`${String(index+1).padStart(3,"0")}-${currentOutputFilename(item)}`,
      bytes:item.output
    })));
    downloadBlob(new Blob([Uint8Array.from(zip).buffer],{type:"application/zip"}),"batch-outputs.zip");
  }

  return <div className="batch-page">
    <section className="tools-hero">
      <p className="eyebrow">Batch automation</p>
      <h2>Apply the same saved actions to multiple PDFs.</h2>
      <p>Choose actions in order, add several PDFs, and run the same workflow on all of them. Passwords for protected files are kept only in this open Batch page and are never saved in workflows.</p>
    </section>
    {error?<div className="error-banner"><strong>Batch issue</strong><span>{error}</span></div>:null}
    <div className="batch-layout">
      <aside className="batch-recipe"><h3>Workflow</h3>
        <label>Name<input disabled={recipeLocked} value={recipe.name} onChange={event=>setRecipe({...recipe,name:event.target.value})}/></label>
        <div className="batch-step-add">
          <select disabled={recipeLocked} value={newStepType} onChange={event=>setNewStepType(event.target.value as BatchStep["type"])}>
            {STEP_TYPES.map(item=><option key={item.type} value={item.type}>{item.label}</option>)}
          </select>
          <button className="button button--small" disabled={recipeLocked} onClick={()=>appendStep(newStepType)} type="button">Add step</button>
        </div>
        <div className="batch-steps">
          {recipe.steps.map((step,index)=><article className="batch-step" key={step.id}>
            <header>
              <strong>{index+1}. {batchStepLabel(step)}</strong>
              <div>
                <button disabled={recipeLocked||index===0} onClick={()=>moveStep(index,-1)} type="button">↑</button>
                <button disabled={recipeLocked||index===recipe.steps.length-1} onClick={()=>moveStep(index,1)} type="button">↓</button>
                <button disabled={recipeLocked} onClick={()=>setRecipe(current=>({...current,steps:current.steps.filter(item=>item.id!==step.id)}))} type="button">×</button>
              </div>
            </header>
            <StepEditor step={step} disabled={recipeLocked} patch={value=>patchStep(step.id,value)}/>
          </article>)}
        </div>
        {!recipe.steps.length?<p className="muted">No steps. Add one above.</p>:null}
        <label>Output suffix<input disabled={recipeLocked} value={recipe.outputSuffix} onChange={event=>setRecipe({...recipe,outputSuffix:event.target.value.replace(/[^a-zA-Z0-9_-]/g,"")})}/></label>
        <div className="batch-recipe-actions">
          <button className="button button--secondary" disabled={recipeLocked||!recipe.steps.length} onClick={()=>void saveRecipe()} type="button">Save workflow</button>
          <button className="button button--ghost" disabled={recipeLocked||!recipe.steps.length} onClick={exportRecipe} type="button">Export workflow</button>
          <button className="button button--ghost" disabled={recipeLocked} onClick={()=>recipeInputRef.current?.click()} type="button">Import workflow</button>
          <input ref={recipeInputRef} hidden accept="application/json,.json" type="file" onChange={event=>{const file=event.target.files?.[0];if(file)void importRecipe(file);event.target.value="";}}/>
        </div>
        {recipes.length?<label>Saved workflows<select disabled={recipeLocked} value={recipes.some(entry=>entry.id===recipe.id)?recipe.id:""} onChange={event=>{const selected=recipes.find(entry=>entry.id===event.target.value);if(selected)setRecipe(selected);}}><option value="">Select…</option>{recipes.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>:null}
        <details className="batch-boundary"><summary>Batch boundaries</summary><p>Linear PDF steps are reusable. Split/page-image export must be last. Multi-input composition, OCR review, recovery, DOCX/text export, and output passwords stay outside saved recipes.</p></details>
      </aside>

      <main className="batch-queue">
        <div className="batch-toolbar">
          <button className="button" disabled={running} onClick={()=>inputRef.current?.click()} type="button">Add PDFs</button>
          <input ref={inputRef} accept="application/pdf,.pdf" hidden multiple type="file" onChange={event=>{if(event.target.files)addFiles(event.target.files);event.target.value="";}}/>
          <button className="button button--secondary" disabled={running||!items.length} onClick={clearQueue} type="button">Clear</button>
          <button className="button button--secondary" disabled={running||!items.some(hasCurrentOutput)} onClick={downloadAll} type="button">Download all ZIP</button>
          <span>{items.length} file(s)</span>
        </div>

        <div className="batch-items">
          {items.map(item=><article className={`batch-item batch-item--${item.status}`} key={item.id}>
            <div><strong>{item.file.name}</strong><span>{(item.file.size/1_000_000).toFixed(2)} MB</span></div>
            <div>
              <span>{item.output&&!hasCurrentOutput(item)?"Workflow, input, or session credential changed · Run again":item.message}</span>
              <progress max="1" value={item.output&&!hasCurrentOutput(item)?0:item.progress}/>
            </div>

            {item.status==="needs-password"?<div className="batch-credential">
              <label>
                <span>Password for this PDF</span>
                <input
                  aria-label={`Password for ${item.file.name}`}
                  autoComplete="off"
                  disabled={credentialBusy===item.id}
                  onChange={event=>setPasswordDrafts(current=>({...current,[item.id]:event.target.value}))}
                  type="password"
                  value={passwordDrafts[item.id]??""}
                />
              </label>
              <button className="button button--tiny" disabled={credentialBusy===item.id||!(passwordDrafts[item.id]??"")} onClick={()=>void useSessionPassword(item)} type="button">{credentialBusy===item.id?"Checking…":"Use for this file"}</button>
              <small>Session only · PDF Studio does not put this password in saved/exported workflows, output names, or queue messages.</small>
            </div>:null}

            {item.hasSessionPassword&&item.status!=="needs-password"?<div className="batch-credential-state">
              <span>Session password ready</span>
              <button className="button button--tiny button--ghost" disabled={running} onClick={()=>forgetSessionPassword(item)} type="button">Forget</button>
            </div>:null}

            {item.error?<p>{item.error}</p>:null}
            {item.terminalSummary?<small className="batch-output-summary">{item.terminalSummary}</small>:null}
            {item.warnings?.length?<details className="batch-output-warnings"><summary>{item.warnings.length} output note{item.warnings.length===1?"":"s"}</summary>{item.warnings.map((warning,index)=><p key={`${index}-${warning}`}>{warning}</p>)}</details>:null}

            <div className="batch-item__actions">
              {hasCurrentOutput(item)?<button className="button button--tiny" onClick={()=>downloadBlob(new Blob([Uint8Array.from(item.output!).buffer],{type:item.outputMime||"application/pdf"}),currentOutputFilename(item))} type="button">Download</button>:null}
              <button className="button button--tiny button--ghost" disabled={running} onClick={()=>removeItem(item)} type="button">Remove</button>
            </div>
          </article>)}
        </div>

        {!items.length?<div className="empty-state"><strong>No PDFs added yet</strong><p>Add files, choose your workflow, then start processing.</p></div>:null}

        <footer className="batch-runbar">
          <button className="button" disabled={running||!items.some(needsRun)||!recipe.steps.length} onClick={()=>void run()} type="button">{paused?"Resume":"Run workflow"}</button>
          {paused&&!running?<button className="button button--secondary" onClick={()=>setPaused(false)} type="button">Stop</button>:null}
          {running?<>
            <button className="button button--secondary" onClick={()=>{pauseRef.current=true;}} type="button">Pause after current</button>
            <button className="button button--ghost" onClick={()=>abortRef.current?.abort()} type="button">Cancel current</button>
          </>:null}
        </footer>
      </main>
    </div>
  </div>;
}

function StepEditor({step,disabled,patch}:{step:BatchStep;disabled:boolean;patch:(value:Partial<BatchStep>)=>void}){
  if(step.type==="rotate")return <label>Degrees<select disabled={disabled} value={step.degrees} onChange={event=>patch({degrees:Number(event.target.value) as 90|180|270})}><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>;
  if(step.type==="crop")return <div className="batch-step-grid">{(["topMm","rightMm","bottomMm","leftMm"] as const).map(key=><label key={key}>{key.replace("Mm","")} (mm)<input disabled={disabled} min="0" type="number" value={step[key]} onChange={event=>patch({[key]:Math.max(0,Number(event.target.value))} as Partial<BatchStep>)}/></label>)}</div>;
  if(step.type==="decorate")return <div className="batch-step-grid"><label>Watermark<input disabled={disabled} value={step.watermarkText} onChange={event=>patch({watermarkText:event.target.value})}/></label><label>Header<input disabled={disabled} value={step.headerText} onChange={event=>patch({headerText:event.target.value})}/></label><label>Footer<input disabled={disabled} value={step.footerText} onChange={event=>patch({footerText:event.target.value})}/></label><label className="check-row"><input disabled={disabled} checked={step.pageNumbers} type="checkbox" onChange={event=>patch({pageNumbers:event.target.checked})}/> Page numbers</label><label>Start<input disabled={disabled} type="number" value={step.startNumber} onChange={event=>patch({startNumber:Number(event.target.value)})}/></label><label>Script<select disabled={disabled} value={step.fontLanguage ?? "auto"} onChange={event=>patch({fontLanguage:event.target.value as "auto"|"ko"|"ja"|"zh-Hans"|"zh-Hant"})}><option value="auto">Auto</option><option value="ko">Korean</option><option value="ja">Japanese</option><option value="zh-Hans">Chinese · Simplified</option><option value="zh-Hant">Chinese · Traditional</option></select></label></div>;
  if(step.type==="blank-pages")return <div className="batch-step-grid"><label>Position<select disabled={disabled} value={step.position} onChange={event=>patch({position:event.target.value as "start"|"end"})}><option value="start">Start</option><option value="end">End</option></select></label><label>Count<input disabled={disabled} min="1" max="20" type="number" value={step.count} onChange={event=>patch({count:Number(event.target.value)})}/></label><label>Width (mm)<input disabled={disabled} min="25" type="number" value={step.widthMm} onChange={event=>patch({widthMm:Number(event.target.value)})}/></label><label>Height (mm)<input disabled={disabled} min="25" type="number" value={step.heightMm} onChange={event=>patch({heightMm:Number(event.target.value)})}/></label></div>;
  if(step.type==="extract-pages"||step.type==="remove-pages")return <label>Pages<input disabled={disabled} placeholder="1-3, 5, 8-last" value={step.selection} onChange={event=>patch({selection:event.target.value})}/><small>The expression is evaluated against each file at this point in the workflow.</small></label>;
  if(step.type==="flatten")return <div className="batch-step-grid"><label className="check-row"><input checked={step.flattenForms} disabled={disabled||(step.flattenForms&&!step.flattenAnnotations)} onChange={event=>patch({flattenForms:event.target.checked})} type="checkbox"/> Forms</label><label className="check-row"><input checked={step.flattenAnnotations} disabled={disabled||(step.flattenAnnotations&&!step.flattenForms)} onChange={event=>patch({flattenAnnotations:event.target.checked})} type="checkbox"/> Annotations</label><small>At least one must stay selected. Flattened content is no longer interactive.</small></div>;
  if(step.type==="sanitize")return <div className="batch-step-grid"><label className="check-row"><input checked={step.removeAttachments} disabled={disabled} onChange={event=>patch({removeAttachments:event.target.checked})} type="checkbox"/> Remove attachments</label><label className="check-row"><input checked={step.removeMetadata} disabled={disabled} onChange={event=>patch({removeMetadata:event.target.checked})} type="checkbox"/> Remove metadata</label><small>JavaScript, automatic actions and revision history are cleaned by this step. This is not redaction or malware certification.</small></div>;
  if(step.type==="target-size")return <div className="batch-step-grid"><label>Target (MB)<input disabled={disabled} min="0.000001" step="0.1" type="number" value={Number((step.targetBytes/1_000_000).toFixed(4))} onChange={event=>patch({targetBytes:Math.max(1,Math.round(Number(event.target.value)*1_000_000))} as Partial<BatchStep>)}/></label><label>Priority<select disabled={disabled} value={step.preservation} onChange={event=>patch({preservation:event.target.value as "preserve-structure"|"allow-raster"} as Partial<BatchStep>)}><option value="preserve-structure">Keep PDF structure</option><option value="allow-raster">Prioritize target</option></select><small>Files already at or below the target pass through unchanged. Otherwise Batch uses P15's bounded target ladder.</small></label></div>;
  if(step.type==="raster-compress")return <label>Profile<select disabled={disabled} value={step.profile} onChange={event=>patch({profile:event.target.value as "screen"|"balanced"|"small"|"print"} as Partial<BatchStep>)}><option value="screen">Screen</option><option value="balanced">Balanced</option><option value="small">Small</option><option value="print">Print</option></select></label>;
  if(step.type==="grayscale")return <label>Profile<select disabled={disabled} value={step.profile} onChange={event=>patch({profile:event.target.value as "screen"|"balanced"|"print"} as Partial<BatchStep>)}><option value="screen">Screen</option><option value="balanced">Balanced</option><option value="print">Print</option></select><small>Converts pages to images, so searchable and interactive PDF features are removed.</small></label>;
  if(step.type==="split-fixed")return <label>Pages per PDF<input disabled={disabled} min="1" max="500" type="number" value={step.pagesPerFile} onChange={event=>patch({pagesPerFile:Math.max(1,Math.min(500,Math.round(Number(event.target.value))))} as Partial<BatchStep>)}/><small>Terminal step · produces a ZIP of ordered PDF parts.</small></label>;
  if(step.type==="page-images")return <label>Image quality<select disabled={disabled} value={step.quality} onChange={event=>patch({quality:event.target.value as "compact"|"balanced"|"high"} as Partial<BatchStep>)}><option value="compact">Compact</option><option value="balanced">Balanced</option><option value="high">High</option></select><small>Terminal step · produces a ZIP of PNG pages in source-page order.</small></label>;
  return <p className="muted">No additional settings.</p>;
}
