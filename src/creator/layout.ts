import type { CreatorBlock, CreatorFontFamily, CreatorFontRole, CreatorInlineRun, CreatorInlineStyle, CreatorLayout, CreatorPageCommand, CreatorStyle } from "../types/creator";

const PT_PER_MM=72/25.4;
const mmToPt=(value:number)=>Math.max(0,Number.isFinite(value)?value:0)*PT_PER_MM;
export const CREATOR_PAGE_SIZES_MM={a4:{width:210,height:297},a5:{width:148,height:210}} as const;
export function creatorPageSizeMm(style:CreatorStyle):{width:number;height:number}{if(style.pagePreset==="custom")return{width:clamp(style.customWidthMm,80,500),height:clamp(style.customHeightMm,80,500)};return CREATOR_PAGE_SIZES_MM[style.pagePreset];}
function clamp(value:number,min:number,max:number):number{return Math.min(max,Math.max(min,Number.isFinite(value)?value:min));}
function isCjk(char:string):boolean{return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(char);}
function charWidth(char:string,size:number,role:CreatorFontRole):number{if(isCjk(char))return size;if(char===" "||char==="\t")return size*.29;if(/[ilI1.,'`:;|!]/.test(char))return size*.25;if(/[mwMW@%&#]/.test(char))return size*.78;return size*(role==="mono"?.61:.51);}
export function estimateCreatorTextWidth(text:string,size:number,role:CreatorFontRole="body"):number{return[...text].reduce((sum,char)=>sum+charWidth(char,size,role),0);}
export function wrapCreatorText(text:string,maxWidth:number,size:number,role:CreatorFontRole="body"):string[]{return wrapStyledRuns([{text,style:"normal"}],maxWidth,size,role).map(line=>line.map(run=>run.text).join(""));}

interface StyledRun { text:string; role:CreatorFontRole; href?:string; underline?:boolean; }
function combineRole(base:CreatorFontRole,style:CreatorInlineStyle):CreatorFontRole{
  if(style==="code")return"mono";if(style==="bold-italic")return"bold-italic";
  if(style==="bold")return base==="italic"||base==="bold-italic"?"bold-italic":"bold";
  if(style==="italic")return base==="bold"||base==="bold-italic"?"bold-italic":"italic";
  return base;
}
function normalizeRuns(runs:CreatorInlineRun[],baseRole:CreatorFontRole):StyledRun[]{return runs.filter(run=>run.text).map(run=>({text:run.text,role:combineRole(baseRole,run.style),href:run.href,underline:run.style==="link"}));}
function pushStyled(target:StyledRun[],run:StyledRun,text:string){if(!text)return;const previous=target[target.length-1];if(previous&&previous.role===run.role&&previous.href===run.href&&previous.underline===run.underline)previous.text+=text;else target.push({...run,text});}
function wrapStyledRuns(runs:CreatorInlineRun[]|StyledRun[],maxWidth:number,size:number,baseRole:CreatorFontRole="body"):StyledRun[][]{
  const styled=(runs.length&&"style" in runs[0]?normalizeRuns(runs as CreatorInlineRun[],baseRole):runs as StyledRun[]);const lines:StyledRun[][]=[];let line:StyledRun[]=[];let width=0;
  const flush=()=>{while(line.length&&/^\s*$/.test(line[line.length-1].text))line.pop();lines.push(line);line=[];width=0;};
  for(const run of styled){for(const token of run.text.match(/\S+\s*|\s+/g)??[run.text]){let tokenWidth=estimateCreatorTextWidth(token,size,run.role);if(line.length&&width+tokenWidth>maxWidth&&!/^\s+$/.test(token)){flush();}
      if(tokenWidth<=maxWidth){pushStyled(line,run,line.length?token:token.replace(/^\s+/,""));width+=estimateCreatorTextWidth(line.length?token:token.replace(/^\s+/,""),size,run.role);continue;}
      for(const char of [...token]){const cw=estimateCreatorTextWidth(char,size,run.role);if(line.length&&width+cw>maxWidth)flush();pushStyled(line,run,char);width+=cw;}
    }}if(line.length||!lines.length)flush();return lines;
}

interface BlockStyle{size:number;role:CreatorFontRole;family:CreatorFontFamily;gray:number;before:number;after:number;indent:number;prefix?:string;lineHeight:number;}
function blockStyle(block:CreatorBlock,style:CreatorStyle):BlockStyle{const base=clamp(style.bodySizePt,7,24),gap=clamp(style.paragraphGapPt,0,36),line=clamp(style.lineHeight,1,2.2);if(block.type==="heading"){const factors=[0,2,1.6,1.35,1.18,1.05,.96];return{size:base*factors[block.level]*clamp(style.headingScale,.8,1.5),role:"bold",family:style.fontFamily,gray:.08,before:block.level===1?0:gap*1.3,after:gap*.65,indent:0,lineHeight:1.12};}if(block.type==="bullet")return{size:base,role:"body",family:style.fontFamily,gray:.12,before:0,after:gap*.25,indent:16,prefix:"• ",lineHeight:line};if(block.type==="numbered")return{size:base,role:"body",family:style.fontFamily,gray:.12,before:0,after:gap*.25,indent:20,prefix:`${block.number}. `,lineHeight:line};if(block.type==="quote")return{size:base*.96,role:"italic",family:style.fontFamily,gray:.28,before:gap*.25,after:gap*.7,indent:14,prefix:"▎ ",lineHeight:line};if(block.type==="code")return{size:Math.max(7,base*.86),role:"mono",family:"sans",gray:.1,before:gap*.3,after:gap*.7,indent:10,lineHeight:1.35};return{size:base,role:"body",family:style.fontFamily,gray:.12,before:0,after:gap,indent:0,lineHeight:line};}
function blockRuns(block:CreatorBlock,baseRole:CreatorFontRole,prefix:string):StyledRun[]{if(block.type==="rule")return[];if(block.type==="code")return[{text:block.text,role:"mono"}];const raw=block.runs??[{text:block.text,style:"normal" as const}];const output=normalizeRuns(raw,baseRole);if(prefix)output.unshift({text:prefix,role:baseRole});return output;}

export function layoutCreatorDocument(blocks:CreatorBlock[],style:CreatorStyle):CreatorLayout{
  const page=creatorPageSizeMm(style),pageWidthPt=mmToPt(page.width),pageHeightPt=mmToPt(page.height);const left=mmToPt(clamp(style.marginLeftMm,5,page.width/3)),right=mmToPt(clamp(style.marginRightMm,5,page.width/3)),top=mmToPt(clamp(style.marginTopMm,5,page.height/3)),bottom=mmToPt(clamp(style.marginBottomMm,5,page.height/3));const headerReserve=style.headerText?18:0,footerReserve=(style.footerText||style.pageNumbers)?18:0,contentTop=top+headerReserve,contentBottom=pageHeightPt-bottom-footerReserve,contentWidth=Math.max(72,pageWidthPt-left-right);const pages:{commands:CreatorPageCommand[]}[]=[{commands:[]}];let pageIndex=0,y=contentTop;const warnings:string[]=[];const current=()=>pages[pageIndex],nextPage=()=>{pageIndex+=1;pages.push({commands:[]});y=contentTop;},need=(height:number)=>{if(y+height>contentBottom&&current().commands.length)nextPage();};
  const addText=(run:StyledRun,x:number,size:number,family:CreatorFontFamily,gray:number)=>{const widthPt=estimateCreatorTextWidth(run.text,size,run.role);current().commands.push({type:"text",xPt:x,yTopPt:y+size,text:run.text,fontSizePt:size,fontRole:run.role,fontFamily:run.role==="mono"?"sans":family,gray,underline:run.underline,linkUrl:run.href,widthPt});return widthPt;};
  for(const block of blocks){if(block.type==="rule"){need(18);y+=7;current().commands.push({type:"rule",xPt:left,yTopPt:y,widthPt:contentWidth,gray:.72});y+=11;continue;}const bs=blockStyle(block,style);y+=bs.before;const maxWidth=contentWidth-bs.indent;const runs=blockRuns(block,bs.role,bs.prefix??"");const lines=wrapStyledRuns(runs,maxWidth,bs.size,bs.role);const lineHeight=bs.size*bs.lineHeight;for(const line of lines){need(lineHeight+2);let x=left+bs.indent;for(const run of line)x+=addText(run,x,bs.size,bs.family,bs.gray);y+=lineHeight;}y+=bs.after;}
  if(!blocks.length)warnings.push("The document has no printable text blocks.");pages.forEach((target,index)=>{const pageNumber=Math.round(style.firstPageNumber)+index;if(style.headerText)target.commands.push({type:"text",xPt:left,yTopPt:top*.58,text:style.headerText,fontSizePt:8,fontRole:"body",fontFamily:style.fontFamily,gray:.4});if(style.footerText)target.commands.push({type:"text",xPt:left,yTopPt:pageHeightPt-bottom*.45,text:style.footerText,fontSizePt:8,fontRole:"body",fontFamily:style.fontFamily,gray:.4});if(style.pageNumbers)target.commands.push({type:"text",xPt:pageWidthPt-right-18,yTopPt:pageHeightPt-bottom*.45,text:String(pageNumber),fontSizePt:8,fontRole:"body",fontFamily:style.fontFamily,gray:.4});});return{pageWidthPt,pageHeightPt,pages,warnings};
}
