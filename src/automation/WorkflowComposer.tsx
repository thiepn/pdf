import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { actionFromBatchStep, getHeadlessAction } from "../actions/actionCatalog";
import { batchStepLabel } from "../processing/batchModel";
import type { BatchStep } from "../types/batch";
import {
  F6_MAX_STEPS, addWorkflowStep, duplicateWorkflowStep, reorderWorkflowSteps, terminalStep
} from "./workflowComposerModel";
import "./workflowComposer.css";

const PALETTE: Array<{type: BatchStep["type"]; group: "Document"|"Pages"|"Appearance"|"Export"}> = [
  {type:"optimize",group:"Document"},{type:"remove-metadata",group:"Document"},
  {type:"rotate",group:"Pages"},{type:"crop",group:"Pages"},{type:"blank-pages",group:"Pages"},
  {type:"decorate",group:"Appearance"},{type:"raster-compress",group:"Appearance"},{type:"grayscale",group:"Appearance"},
  {type:"split-fixed",group:"Export"},{type:"page-images",group:"Export"}
];
const GROUPS = ["Document","Pages","Appearance","Export"] as const;
const NAME: Record<BatchStep["type"],string> = {
  optimize:"Compress PDF", "remove-metadata":"Remove metadata",rotate:"Rotate pages",
  crop:"Crop margins",decorate:"Watermark & numbering","blank-pages":"Insert blank pages",
  "raster-compress":"Raster compression",grayscale:"Grayscale",
  "split-fixed":"Split to ZIP","page-images":"Export page images"
};

interface Props {
  steps: BatchStep[];
  disabled: boolean;
  onChange(steps: BatchStep[]): void;
  onError(message: string): void;
  renderParameters(step: BatchStep): ReactNode;
}

export function WorkflowComposer({steps,disabled,onChange,onError,renderParameters}: Props) {
  const [search,setSearch] = useState("");
  const [selectedId,setSelectedId] = useState<string | null>(steps[0]?.id ?? null);
  const [draggedId,setDraggedId] = useState<string | null>(null);
  const selected = steps.find(step=>step.id === selectedId) ?? steps[0] ?? null;
  const actions=useMemo(()=>PALETTE.filter(item=>{
    const name=NAME[item.type];
    return `${name} ${item.group}`.toLowerCase().includes(search.trim().toLowerCase());
  }),[search]);
  useEffect(()=>{
    if (!steps.length) setSelectedId(null);
    else if (selectedId && !steps.some(step=>step.id===selectedId)) setSelectedId(steps[0].id);
  },[steps,selectedId]);
  function add(type:BatchStep["type"]) {
    try {
      const id=crypto.randomUUID();
      onChange(addWorkflowStep(steps,type,id));
      setSelectedId(id);
    } catch(reason) { onError(reason instanceof Error ? reason.message : String(reason)); }
  }
  function duplicate(step:BatchStep) {
    try {
      const id=crypto.randomUUID();
      onChange(duplicateWorkflowStep(steps,step.id,id));
      setSelectedId(id);
    } catch(reason) {onError(reason instanceof Error ? reason.message : String(reason));}
  }
  function shift(id:string,direction:-1|1) {
    const index=steps.findIndex(step=>step.id===id);
    const target=index+direction;
    if (target<0||target>=steps.length) return;
    const before = direction===-1 ? steps[target].id : (steps[target+1]?.id??null);
    onChange(reorderWorkflowSteps(steps,id,before));
  }
  function drop(event:DragEvent<HTMLElement>,beforeId:string|null) {
    event.preventDefault();
    if (!disabled && draggedId) onChange(reorderWorkflowSteps(steps,draggedId,beforeId));
    setDraggedId(null);
  }
  return <div className="f6-composer" aria-label="Visual workflow composer">
    <div className="f6-composer__palette">
      <div className="f6-composer__heading">
        <div><span className="f6-kicker">01 / ACTIONS</span><h4>Action library</h4></div>
        <span className="f6-count">{steps.length}/{F6_MAX_STEPS}</span>
      </div>
      <label className="f6-search"><span className="sr-only">Search workflow actions</span><input aria-label="Search workflow actions" disabled={disabled} placeholder="Find an action…" value={search} onChange={event=>setSearch(event.target.value)} type="search"/></label>
      <div className="f6-palette-scroll">
        {GROUPS.map(group=>{
          const entries=actions.filter(item=>item.group===group);
          return entries.length ? <section className="f6-palette-group" key={group}>
            <h5>{group}</h5>
            {entries.map(({type})=><button className="f6-palette-item" disabled={disabled||steps.length>=F6_MAX_STEPS} key={type} type="button" onClick={()=>add(type)}>
              <span>{NAME[type]}</span><span aria-hidden="true">+</span>
            </button>)}
          </section> : null;
        })}
        {!actions.length?<p className="f6-palette-empty">No matching actions.</p>:null}
      </div>
    </div>
    <div className="f6-composer__canvas">
      <div className="f6-composer__heading"><div><span className="f6-kicker">02 / SEQUENCE</span><h4>Workflow steps</h4></div><span className="f6-muted">Drag or use arrows</span></div>
      <div className="f6-sequence" aria-label="Ordered workflow steps">
        <div className="f6-sequence-start">INPUT <span>PDF</span></div>
        {steps.map((step,index)=>{
          const descriptor=getHeadlessAction(actionFromBatchStep(step).actionId);
          const active=selected?.id===step.id;
          return <div key={step.id} className="f6-step-wrap">
            <div className="f6-step-connector" aria-hidden="true" />
            <article
              className={`f6-step${active?" f6-step--active":""}${draggedId===step.id?" f6-step--dragging":""}`}
              draggable={!disabled}
              onDragStart={event=>{if(disabled){event.preventDefault();return;}setDraggedId(step.id);event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",step.id);}}
              onDragOver={event=>{if(!disabled) event.preventDefault();}}
              onDrop={event=>drop(event,step.id)}
              onDragEnd={()=>setDraggedId(null)}
              aria-label={`Step ${index+1}: ${NAME[step.type]}`}
            >
              <button className="f6-step__select" type="button" aria-pressed={active} onClick={()=>setSelectedId(step.id)}>
                <span className="f6-step__index">{String(index+1).padStart(2,"0")}</span>
                <span className="f6-step__body"><strong>{NAME[step.type]}</strong><small>{batchStepLabel(step)}</small></span>
                <span className="f6-step__flags">
                  {terminalStep(step)?<span>Final</span>:null}
                  {descriptor.risks.length?<span className="f6-step__risk">Changes content</span>:null}
                </span>
              </button>
              <div className="f6-step__controls">
                <button aria-label={`Move ${NAME[step.type]} up`} disabled={disabled||index===0} onClick={()=>shift(step.id,-1)} type="button">↑</button>
                <button aria-label={`Move ${NAME[step.type]} down`} disabled={disabled||index===steps.length-1||terminalStep(step)} onClick={()=>shift(step.id,1)} type="button">↓</button>
                <button aria-label={`Duplicate ${NAME[step.type]}`} disabled={disabled||terminalStep(step)||steps.length>=F6_MAX_STEPS} onClick={()=>duplicate(step)} type="button">⧉</button>
                <button aria-label={`Remove ${NAME[step.type]}`} disabled={disabled} onClick={()=>onChange(steps.filter(item=>item.id!==step.id))} type="button">×</button>
              </div>
            </article>
          </div>;
        })}
        <div className="f6-step-connector" aria-hidden="true"/>
        <div className="f6-sequence-end">OUTPUT <span>{steps.length&&terminalStep(steps[steps.length-1])?"ZIP":"PDF"}</span></div>
      </div>
    </div>
    <div className="f6-composer__inspector">
      <div className="f6-composer__heading"><div><span className="f6-kicker">03 / CONFIGURE</span><h4>Step settings</h4></div></div>
      {selected?<div className="f6-inspector-body" key={selected.id}>
        <strong>{NAME[selected.type]}</strong>
        <p>{getHeadlessAction(actionFromBatchStep(selected).actionId).description}</p>
        <fieldset disabled={disabled} className="f6-inspector-fields"><legend className="sr-only">Step settings</legend>{renderParameters(selected)}</fieldset>
      </div>:<div className="f6-inspector-empty">Select a step or add an action from the library to configure it.</div>}
      <p className="f6-inspector-help">Changes update the workflow immediately. Outputs from older settings are marked stale and need to be generated again.</p>
    </div>
  </div>;
}
