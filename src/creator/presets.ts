import { CREATOR_PRESET_SCHEMA_VERSION, type CreatorPreset, type CreatorStyle } from "../types/creator";

const KEY="local-pdf-studio-creator-presets-v1";
export const DEFAULT_CREATOR_STYLE:CreatorStyle={pagePreset:"a4",customWidthMm:210,customHeightMm:297,marginTopMm:20,marginRightMm:20,marginBottomMm:20,marginLeftMm:20,fontFamily:"sans",bodySizePt:11,lineHeight:1.48,paragraphGapPt:8,headingScale:1,headerText:"",footerText:"",pageNumbers:true,firstPageNumber:1};
export const BUILTIN_CREATOR_PRESETS:CreatorPreset[]=[
  {schemaVersion:1,id:"builtin-minimal",name:"Minimal",style:{...DEFAULT_CREATOR_STYLE},updatedAt:0},
  {schemaVersion:1,id:"builtin-academic",name:"Academic",style:{...DEFAULT_CREATOR_STYLE,fontFamily:"serif",bodySizePt:11.5,lineHeight:1.55,marginLeftMm:25,marginRightMm:25,marginTopMm:24,marginBottomMm:24},updatedAt:0},
  {schemaVersion:1,id:"builtin-compact",name:"Compact",style:{...DEFAULT_CREATOR_STYLE,bodySizePt:9.5,lineHeight:1.32,paragraphGapPt:5,marginTopMm:14,marginRightMm:14,marginBottomMm:14,marginLeftMm:14},updatedAt:0},
  {schemaVersion:1,id:"builtin-report",name:"Report",style:{...DEFAULT_CREATOR_STYLE,bodySizePt:10.5,lineHeight:1.45,paragraphGapPt:9,marginTopMm:22,marginBottomMm:20,headerText:"Report"},updatedAt:0}
];
function id(){return crypto.randomUUID?.()??`${Date.now()}-${Math.random().toString(16).slice(2)}`;}
export function listCreatorPresets():CreatorPreset[]{try{const raw=JSON.parse(localStorage.getItem(KEY)??"[]") as CreatorPreset[];return[...BUILTIN_CREATOR_PRESETS,...raw.filter(item=>item&&item.schemaVersion===CREATOR_PRESET_SCHEMA_VERSION&&item.name&&item.style)];}catch{return[...BUILTIN_CREATOR_PRESETS];}}
export function saveCreatorPreset(name:string,style:CreatorStyle):CreatorPreset{const preset:CreatorPreset={schemaVersion:CREATOR_PRESET_SCHEMA_VERSION,id:id(),name:name.trim()||"Custom preset",style:structuredClone(style),updatedAt:Date.now()};const custom=listCreatorPresets().filter(item=>!item.id.startsWith("builtin-"));custom.push(preset);localStorage.setItem(KEY,JSON.stringify(custom));return preset;}
export function deleteCreatorPreset(idValue:string):void{if(idValue.startsWith("builtin-"))return;const custom=listCreatorPresets().filter(item=>!item.id.startsWith("builtin-")&&item.id!==idValue);localStorage.setItem(KEY,JSON.stringify(custom));}
