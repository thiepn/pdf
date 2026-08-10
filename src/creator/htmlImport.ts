import type { CreatorBlock, CreatorInlineRun, CreatorInlineStyle } from "../types/creator";

function compactText(node: Node): string { return (node.textContent ?? "").replace(/\s+/g, " ").trim(); }
function pushRun(runs:CreatorInlineRun[],text:string,style:CreatorInlineStyle="normal",href?:string){const value=text.replace(/\s+/g," ");if(!value)return;const prev=runs[runs.length-1];if(prev&&prev.style===style&&prev.href===href)prev.text+=value;else runs.push({text:value,style,...(href?{href}:{})});}
function inlineRuns(node:Node,style:CreatorInlineStyle="normal"):CreatorInlineRun[]{const runs:CreatorInlineRun[]=[];const visit=(current:Node,currentStyle:CreatorInlineStyle)=>{if(current.nodeType===Node.TEXT_NODE){pushRun(runs,current.textContent??"",currentStyle);return;}if(!(current instanceof Element))return;const tag=current.tagName.toLowerCase();let next=currentStyle;if(tag==="strong"||tag==="b")next=currentStyle==="italic"?"bold-italic":"bold";else if(tag==="em"||tag==="i")next=currentStyle==="bold"?"bold-italic":"italic";else if(tag==="code")next="code";if(tag==="a"){const href=current.getAttribute("href")??"";const safe=/^(https?:\/\/|mailto:)/i.test(href)?href:undefined;for(const child of Array.from(current.childNodes)){if(child.nodeType===Node.TEXT_NODE)pushRun(runs,child.textContent??"","link",safe);else visit(child,"link");}return;}for(const child of Array.from(current.childNodes))visit(child,next);};visit(node,style);return runs.map(run=>({...run,text:run.text}));}
function blockPayload(node:Node){const runs=inlineRuns(node);const text=runs.map(run=>run.text).join("").replace(/\s+/g," ").trim();return{text,runs};}

export function htmlToCreatorBlocks(source: string): CreatorBlock[] {
  const document = new DOMParser().parseFromString(source, "text/html");
  document.querySelectorAll("script,style,noscript,template,iframe,object,embed").forEach((node) => node.remove());
  const blocks: CreatorBlock[] = []; let ordered = 1;
  const visit = (node: Element): void => {
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) { const payload=blockPayload(node); if(payload.text) blocks.push({type:"heading",level:Number(tag.slice(1)) as 1|2|3|4|5|6,...payload}); return; }
    if (tag === "p") { const payload=blockPayload(node); if(payload.text) blocks.push({type:"paragraph",...payload}); return; }
    if (tag === "div" || tag === "section" || tag === "article" || tag === "main" || tag === "header" || tag === "footer") { for (const child of Array.from(node.children)) visit(child); if (!node.children.length) { const payload=blockPayload(node); if(payload.text)blocks.push({type:"paragraph",...payload}); } return; }
    if (tag === "blockquote") { const payload=blockPayload(node); if(payload.text) blocks.push({type:"quote",...payload}); return; }
    if (tag === "pre") { blocks.push({type:"code",text:node.textContent ?? ""}); return; }
    if (tag === "hr") { blocks.push({type:"rule"}); return; }
    if (tag === "ul") { for(const child of Array.from(node.children)){ if(child.tagName.toLowerCase()==="li"){const payload=blockPayload(child);if(payload.text)blocks.push({type:"bullet",...payload});} } return; }
    if (tag === "ol") { ordered=1; for(const child of Array.from(node.children)){ if(child.tagName.toLowerCase()==="li"){const payload=blockPayload(child);if(payload.text)blocks.push({type:"numbered",number:ordered++,...payload});} } return; }
    for (const child of Array.from(node.children)) visit(child);
  };
  for (const child of Array.from(document.body.children)) visit(child);
  if (!blocks.length) { const text=compactText(document.body); if(text)blocks.push({type:"paragraph",text,runs:[{text,style:"normal"}]}); }
  return blocks;
}
