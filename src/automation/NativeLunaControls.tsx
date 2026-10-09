import { useEffect, useMemo, useRef, useState } from "react";
import {
  currentAccountSession, finishPdfAccountSignIn, nativeLunaConfig,
  signOutPdfAccount, startPdfAccountSignIn
} from "./nativeLunaAccount";
import { planPdfWithLuna } from "./nativeLunaClient";

interface Props {
  goal:string;
  disabled:boolean;
  onProposal(json:string,model:"gpt-6-luna",requestId:string):void;
}
export function NativeLunaControls({goal,disabled,onProposal}:Props) {
  const config=useMemo(()=>{try{return nativeLunaConfig();}catch{return null;}},[]);
  const [connected,setConnected]=useState(Boolean(currentAccountSession()));
  const [signingIn,setSigningIn]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{
    let active=true;
    if(config&&new URL(window.location.href).searchParams.has("code")) {
      setSigningIn(true);
      void finishPdfAccountSignIn(config).then(()=>{
        if(active){setConnected(Boolean(currentAccountSession()));setSigningIn(false);setMessage("THIEPN Account connected.");}
      }).catch(reason=>{
        if(active){setError(reason instanceof Error?reason.message:"Account login failed.");setSigningIn(false);}
      });
    }
    return ()=>{active=false;controller.current?.abort();};
  },[config]);
  async function signIn() {
    if(!config)return;
    setError("");
    try{await startPdfAccountSignIn(config);}
    catch(reason){setError(reason instanceof Error?reason.message:"Could not begin Account sign-in.");}
  }
  async function generate() {
    if(!config||busy||disabled)return;
    if(goal.trim().length<3){setError("Enter a goal of at least three characters.");return;}
    const abort=new AbortController();controller.current=abort;
    setError("");setMessage("");setBusy(true);
    try{
      const result=await planPdfWithLuna(goal,config,abort.signal);
      if(!abort.signal.aborted){
        onProposal(result.json,result.model,result.requestId);
        setMessage("Luna returned a proposal. Review every action before applying it.");
      }
    }catch(reason){
      if(!abort.signal.aborted)setError(reason instanceof Error?reason.message:"Native planning failed.");
    }finally{
      if(controller.current===abort)controller.current=null;
      setBusy(false);
    }
  }
  return <div className="f8-native" aria-label="Native GPT-6 Luna planner">
    <div className="f8-native__intro"><strong>GPT-6 Luna · Native planning</strong>
      <span>{!config?"Not configured on this deployment":signingIn?"Completing Account sign-in":connected?"THIEPN Account connected":"Sign in with THIEPN Account"}</span>
    </div>
    <div className="f7-planner__actions">
      {config&&connected?<button className="button" type="button" disabled={disabled||busy||signingIn||goal.trim().length<3} onClick={()=>void generate()}>{busy?"Planning…":"Generate with Luna"}</button>:null}
      {config&&!connected?<button className="button button--secondary" disabled={disabled||signingIn} type="button" onClick={()=>void signIn()}>Connect THIEPN Account</button>:null}
      {config&&connected?<button className="button button--ghost" type="button" disabled={disabled||busy} onClick={()=>{signOutPdfAccount();setConnected(false);setMessage("Local PDF AI session cleared.");}}>Disconnect</button>:null}
      {busy?<button className="button button--ghost" type="button" onClick={()=>controller.current?.abort()}>Cancel</button>:null}
    </div>
    {!config?<p className="f7-planner__hint">Native planning requires a configured THIEPN Core gateway and Account OAuth callback. The manual ChatGPT option below is still available.</p>:
      <p className="f7-planner__hint">Only your goal is sent to THIEPN Core for GPT-6 Luna planning. The PDFs stay in your browser. Proposals never run automatically.</p>}
    {error?<p className="f7-planner__error" role="alert">{error}</p>:null}
    {message?<p className="f7-planner__feedback" role="status">{message}</p>:null}
  </div>;
}
