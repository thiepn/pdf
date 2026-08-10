import type { PreservationCategory, PreservationDisposition } from "../types/preservation";
const categories:PreservationCategory[]=["pages","text","images","vectors","fonts","annotations","forms","links","bookmarks","attachments","layers","metadata","signatures","tags","encryption"];
function all(value:PreservationDisposition){return Object.fromEntries(categories.map(key=>[key,value])) as Record<PreservationCategory,PreservationDisposition>}
export function preservationPolicy(operation:string):Record<PreservationCategory,PreservationDisposition>{
 const policy=all("preserve");
 if(operation==="ocr-overlay"){policy.text="modify";policy.fonts="modify";}
 if(operation==="image-optimize"){policy.images="modify";policy.fonts="modify";policy.metadata="modify";}
 if(operation==="impose"){for(const key of categories)policy[key]="unsupported";policy.pages="modify";policy.text="preserve";policy.images="preserve";policy.vectors="preserve";policy.fonts="preserve";policy.metadata="preserve";policy.encryption="modify";}
 return policy;
}
