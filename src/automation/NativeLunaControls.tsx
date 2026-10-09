import {useEffect,useMemo,useRef,useState} from "react";
import {
  currentAccountSession,nativeLunaConfig,probePdfAccountSso,
  signOutPdfAccount,startPdfAccountSignIn,verifyPdfAccount
} from "./nativeLunaAccount";
import {planPdfWithLuna} from "./nativeLunaClient";

interface Props {
  goal:string;
  disabled:boolean;
  onProposal(json:string,model:"gpt-6-luna",requestId:string):void;
}
export function NativeLunaControls({goal,disabled,onProposal}:Props) {
  const config=useMemo(()=>{try{return nativeLunaConfig();}catch{return null;}},[]);
  const [connected,setConnected]=useState(Boolean(config&&currentAccountSession(config)));
  const [checking,setChecking]=useState(Boolean(config));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{
    let active=true;
    if(!config)return;
    const lastResult=sessionStorage.getItem("pdf-studio:f8b:login-result");
    sessionStorage.removeItem("pdf-studio:f8b:login-result");
    if(lastResult&&active){
      if(lastResult==="connected")setMessage("THIEPN Account connected.");
      else setError(lastResult.slice(0,200));
    }
    void (async()=>{
      const signedIn=await verifyPdfAccount(config);
      if(!active)return;
      setConnected(signedIn);
      if(!signedIn&&!lastResult&&navigator.onLine){
        const result=await probePdfAccountSso(config);
        if(!active)return;
        if(result==="signed-in"){
          setMessage("Existing THIEPN Account session recognized. Connecting PDF Studio…");
          try{await startPdfAccountSignIn(config);}
          catch(reason){if(active)setError(reason instanceof Error?reason.message:"Account SSO unavailable.");}
          return;
        }
        if(result==="disconnected")setMessage("PDF Studio was disconnected from THIEPN Account. Reconnect requires explicit approval.");
      }
      if(active)setChecking(false);
    })();
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
    <div className="f8-native__intro">
      <strong>GPT-6 Luna · Native planning</strong>
      <span>{!config?"Not configured on this deployment":checking?"Checking THIEPN Account…":connected?"THIEPN Account connected":"THIEPN Account not connected"}</span>
    </div>
    <div className="f7-planner__actions">
      {config&&connected?<button className="button" type="button" disabled={disabled||busy||checking||goal.trim().length<3} onClick={()=>void generate()}>{busy?"Planning…":"Generate with Luna"}</button>:null}
      {config&&!connected?<button className="button button--secondary" disabled={disabled||checking} type="button" onClick={()=>void signIn()}>Connect THIEPN Account</button>:null}
      {config&&connected?<button className="button button--ghost" type="button" disabled={disabled||busy} onClick={()=>{signOutPdfAccount(config);setConnected(false);setMessage("PDF Studio disconnected locally; automatic sign-in is disabled until you reconnect.");}}>Disconnect PDF Studio</button>:null}
      {busy?<button className="button button--ghost" type="button" onClick={()=>controller.current?.abort()}>Cancel</button>:null}
    </div>
    {!config?<p className="f7-planner__hint">Native planning requires a registered first-party PDF OAuth client, THIEPN Account and Core configuration. Manual ChatGPT planning remains available.</p>:
      <p className="f7-planner__hint">Only your goal is sent to THIEPN Core for GPT-6 Luna planning. Account-owned sign-in uses an app-specific public OAuth client. No PDF bytes leave this browser.</p>}
    {error?<p className="f7-planner__error" role="alert">{error}</p>:null}
    {message?<p className="f7-planner__feedback" role="status">{message}</p>:null}
  </div>;
}
