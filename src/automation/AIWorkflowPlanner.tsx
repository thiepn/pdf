import { useState } from "react";
import { NativeLunaControls } from "./NativeLunaControls";
import { batchRecipeExecutionFingerprint } from "../processing/batchModel";
import type { BatchRecipe } from "../types/batch";
import {
  applyAIWorkflowProposal, buildAIWorkflowPrompt, explainProposalChanges,
  isProposalStillCurrent, parseAIWorkflowProposal,
  type ReviewedAIWorkflow
} from "./aiWorkflowPlanning";
import "./aiWorkflowPlanner.css";

interface Props {
  recipe: BatchRecipe;
  disabled: boolean;
  onApply(recipe: BatchRecipe): void;
}
interface PendingReview { proposal: ReviewedAIWorkflow; fingerprint: string; }
export function AIWorkflowPlanner({recipe,disabled,onApply}: Props) {
  const [goal,setGoal]=useState("");
  const [prompt,setPrompt]=useState("");
  const [response,setResponse]=useState("");
  const [review,setReview]=useState<PendingReview|null>(null);
  const [confirmReplace,setConfirmReplace]=useState(false);
  const [feedback,setFeedback]=useState("");
  const [error,setError]=useState("");
  const stale=review!==null&&!isProposalStillCurrent(review.fingerprint,recipe);
  const changes=review?explainProposalChanges(recipe,review.proposal):null;

  function preparePrompt(): string | null {
    try {
      const result=buildAIWorkflowPrompt(goal);
      setPrompt(result);setError("");
      return result;
    } catch(reason) {
      setError(reason instanceof Error?reason.message:String(reason));
      return null;
    }
  }
  async function copyPrompt() {
    const value=preparePrompt();
    if(!value)return;
    if(!navigator.clipboard?.writeText) {
      setFeedback("Copy is unavailable in this browser. Select the prompt text below and copy it manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("Planning prompt copied. Open ChatGPT, paste it, and copy the JSON reply back here.");
    } catch {
      setFeedback("Clipboard access was blocked. Select the prompt text below and copy it manually.");
    }
  }
  function reviewResponse() {
    setError("");setFeedback("");setReview(null);setConfirmReplace(false);
    try {
      const proposal=parseAIWorkflowProposal(response,recipe);
      setReview({proposal,fingerprint:batchRecipeExecutionFingerprint(recipe)});
    } catch(reason) {
      setError(reason instanceof Error?reason.message:String(reason));
    }
  }
  function apply() {
    if(disabled||!review||!confirmReplace||stale)return;
    try {
      // Revalidate from the copied JSON at the moment of application.
      const checked=parseAIWorkflowProposal(response,recipe);
      if(JSON.stringify(checked.requests)!==JSON.stringify(review.proposal.requests)) {
        throw new Error("The pasted proposal changed since review. Review it again.");
      }
      onApply(applyAIWorkflowProposal(recipe,checked,()=>crypto.randomUUID()));
      setReview(null);setConfirmReplace(false);
      setFeedback("Proposed steps were added to the composer. Review them and approve any destructive effects in Execution preview. Nothing has run.");
      setError("");
    } catch(reason) {
      setError(reason instanceof Error?reason.message:String(reason));
    }
  }

  return <section className="f7-planner" aria-label="AI-assisted workflow planning">
    <div className="f7-planner__header">
      <div>
        <span className="f6-kicker">F8 / NATIVE LUNA + ASSISTED PLANNING</span>
        <h3>Plan with GPT-6 Luna or ChatGPT</h3>
        <p>Describe the outcome. Native Luna or ChatGPT can propose actions; PDF Studio validates the plan. Nothing is applied or executed automatically.</p>
      </div>
      <span className="f7-planner__mode">Native Account-authenticated AI · manual fallback</span>
    </div>
    <div className="f7-planner__columns">
      <div className="f7-planner__stage">
        <h4><span>01</span> Describe your goal</h4>
        <label htmlFor="f7-goal">What should happen to the PDFs?</label>
        <textarea id="f7-goal" aria-label="PDF workflow goal" value={goal} onChange={event=>setGoal(event.target.value)} maxLength={1200}
          rows={3} disabled={disabled} placeholder="E.g., rotate every page 90 degrees, add page numbers, then split into five-page PDFs."/>
        <div className="f7-planner__actions">
          <button type="button" className="button button--secondary" disabled={disabled||!goal.trim()} onClick={()=>void copyPrompt()}>Copy ChatGPT prompt</button>
          <a className="f7-planner__link" href="https://chatgpt.com/" rel="noopener noreferrer" target="_blank">Open ChatGPT ↗</a>
        </div>
        {prompt?<details className="f7-planner__details"><summary>View or manually copy generated prompt</summary><textarea readOnly aria-label="Generated planning prompt" value={prompt} rows={6}/></details>:null}
        <p className="f7-planner__hint">Only your written goal and the public action definitions go into the prompt. PDFs and filenames are not transmitted by PDF Studio.</p>
      </div>
      <div className="f7-planner__stage">
        <h4><span>02</span> Paste a structured proposal</h4>
        <label htmlFor="f7-response">ChatGPT JSON reply</label>
        <textarea id="f7-response" aria-label="ChatGPT workflow JSON" value={response} onChange={event=>{setResponse(event.target.value);setReview(null);setConfirmReplace(false);setError("");}} rows={6}
          disabled={disabled} placeholder={'{"schemaVersion":1,"title":"Prepare documents","rationale":"...","actions":[{"actionId":"pdf.optimize","params":{}}],"notes":[]}'}/>
        <div className="f7-planner__actions">
          <button type="button" className="button button--secondary" disabled={disabled||!response.trim()} onClick={reviewResponse}>Review proposed workflow</button>
          {review?<button className="button button--ghost" type="button" disabled={disabled} onClick={()=>{setReview(null);setConfirmReplace(false);}}>Discard review</button>:null}
        </div>
        <p className="f7-planner__hint">Model output is treated as untrusted data. Unsupported actions, parameters, and approval instructions are rejected.</p>
      </div>
    </div>
    {error?<div className="f7-planner__error" role="alert">{error}</div>:null}
    {feedback?<p className="f7-planner__feedback" role="status">{feedback}</p>:null}
    {review&&changes?<div className="f7-review" aria-label="Proposed workflow review">
      <div className="f7-review__header"><div><span className="f6-kicker">03 / HUMAN REVIEW</span><h4>{review.proposal.title}</h4></div><span>{review.proposal.steps.length} steps</span></div>
      <p>{review.proposal.rationale}</p>
      <div className="f7-review__stats">
        <span>Replace {changes.replaces} existing step(s)</span>
        <span>Apply {changes.introduces} proposed step(s)</span>
        <span>Output: {changes.outputKind==="pdf"?"PDF":"ZIP"}</span>
      </div>
      <ol className="f7-review__actions">
        {review.proposal.requests.map((item,index)=><li key={index}><code>{item.actionId}</code><small>{JSON.stringify(item.params)}</small></li>)}
      </ol>
      {review.proposal.preflight.warnings.length||review.proposal.notes.length?<div className="f7-review__warnings">
        <strong>Limitations and effects</strong>
        <ul>{[...review.proposal.preflight.warnings,...review.proposal.notes].map((warning,index)=><li key={index}>{warning}</li>)}</ul>
      </div>:null}
      {stale?<p className="f7-planner__error" role="alert">The current workflow changed since this proposal was reviewed. Review the JSON again before applying it.</p>:null}
      <label className="f7-review__consent"><input type="checkbox" disabled={disabled||stale} checked={confirmReplace} onChange={event=>setConfirmReplace(event.target.checked)}/>
        I approve replacing the current workflow steps with this proposal. I understand execution is a separate action.
      </label>
      <div className="f7-planner__actions">
        <button type="button" className="button" disabled={disabled||stale||!confirmReplace} onClick={apply}>Apply proposal to composer</button>
        <span className="f7-planner__hint">This does not approve metadata removal or rasterization, and does not start processing.</span>
      </div>
    </div>:null}
  </section>;
}
