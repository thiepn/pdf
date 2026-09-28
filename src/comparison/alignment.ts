import { visualFingerprintSimilarity, type VisualPageFingerprint } from "./visualFingerprint.ts";

export type PageAlignmentStatus="same"|"modified"|"inserted"|"deleted";
export interface PageAlignmentRow{leftPage:number|null;rightPage:number|null;similarity:number;status:PageAlignmentStatus;basis?:"text"|"visual"|"hybrid";}
export interface PageHybridFingerprint { text: string; visual?: VisualPageFingerprint; }
export const MAX_ALIGNMENT_CELLS = 250_000;
interface Fingerprint{normalized:string;tokens:string[];}
function normalize(value:string):string{return value.toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ").slice(0,5000);}
function fingerprint(value:string):Fingerprint{const normalized=normalize(value);const seen=new Set<string>(),tokens:string[]=[];for(const token of normalized.split(" ")){if(token.length<2||seen.has(token))continue;seen.add(token);tokens.push(token);if(tokens.length>=64)break;}return{normalized,tokens};}
function fingerprintSimilarity(a:Fingerprint,b:Fingerprint):number{if(a.normalized===b.normalized&&a.normalized.length>=8)return 1;if(!a.normalized&&!b.normalized)return 0;if(!a.normalized||!b.normalized)return 0;const bSet=new Set(b.tokens);let intersection=0;for(const token of a.tokens)if(bSet.has(token))intersection+=1;const union=new Set([...a.tokens,...b.tokens]).size||1;const jaccard=intersection/union;const lengthRatio=Math.min(a.normalized.length,b.normalized.length)/Math.max(a.normalized.length,b.normalized.length);return Math.max(0,Math.min(1,jaccard*.78+lengthRatio*.22));}
export function pageTextSimilarity(left:string,right:string):number{return fingerprintSimilarity(fingerprint(left),fingerprint(right));}

export function hybridPageSimilarity(left:PageHybridFingerprint,right:PageHybridFingerprint):{similarity:number;basis:"text"|"visual"|"hybrid"}{
  return preparedPageSimilarity(left, right, fingerprint(left.text), fingerprint(right.text));
}
function preparedPageSimilarity(left:PageHybridFingerprint,right:PageHybridFingerprint,leftPrint:Fingerprint,rightPrint:Fingerprint):{similarity:number;basis:"text"|"visual"|"hybrid"}{
  const text=fingerprintSimilarity(leftPrint,rightPrint);
  const textReliable=leftPrint.normalized.length>=24&&rightPrint.normalized.length>=24;
  if(left.visual&&right.visual){const visual=visualFingerprintSimilarity(left.visual,right.visual);if(!textReliable)return{similarity:visual,basis:"visual"};return{similarity:Math.max(0,Math.min(1,text*.76+visual*.24)),basis:"hybrid"};}
  return{similarity:text,basis:"text"};
}

// Status is preliminary page matching; the UI also verifies equal-text pairs visually.
// Exact full text is compared separately: case, punctuation and late edits must not disappear.
export function alignPageFingerprints(left:PageHybridFingerprint[],right:PageHybridFingerprint[]):PageAlignmentRow[]{
  const n=left.length,m=right.length,cols=m+1,gap=-.55;
  if ((n + 1) * (m + 1) > MAX_ALIGNMENT_CELLS) throw new Error("These PDFs exceed the automatic page-matching limit. Compare page pairs, or extract smaller sections first.");
  const leftPrepared=left.map(page=>fingerprint(page.text)),rightPrepared=right.map(page=>fingerprint(page.text));
  const similarityAt=(i:number,j:number)=>preparedPageSimilarity(left[i],right[j],leftPrepared[i],rightPrepared[j]);
  const scores=new Float32Array((n+1)*(m+1)),moves=new Uint8Array((n+1)*(m+1));const at=(i:number,j:number)=>i*cols+j;
  for(let i=1;i<=n;i++){scores[at(i,0)]=i*gap;moves[at(i,0)]=2;}for(let j=1;j<=m;j++){scores[at(0,j)]=j*gap;moves[at(0,j)]=3;}
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){const {similarity}=similarityAt(i-1,j-1);const diagonal=scores[at(i-1,j-1)]+similarity*2-1.3,up=scores[at(i-1,j)]+gap,leftScore=scores[at(i,j-1)]+gap;if(diagonal>=up&&diagonal>=leftScore){scores[at(i,j)]=diagonal;moves[at(i,j)]=1;}else if(up>=leftScore){scores[at(i,j)]=up;moves[at(i,j)]=2;}else{scores[at(i,j)]=leftScore;moves[at(i,j)]=3;}}
  const rows:PageAlignmentRow[]=[];let i=n,j=m;while(i>0||j>0){const move=moves[at(i,j)];if(move===1&&i>0&&j>0){const result=similarityAt(i-1,j-1);rows.push({leftPage:i,rightPage:j,similarity:result.similarity,status:left[i-1].text===right[j-1].text&&result.similarity>=.96?"same":"modified",basis:result.basis});i--;j--;}else if((move===2||j===0)&&i>0){rows.push({leftPage:i,rightPage:null,similarity:0,status:"deleted"});i--;}else{rows.push({leftPage:null,rightPage:j,similarity:0,status:"inserted"});j--;}}
  return rows.reverse();
}
export function alignPageTexts(leftTexts:string[],rightTexts:string[]):PageAlignmentRow[]{return alignPageFingerprints(leftTexts.map(text=>({text})),rightTexts.map(text=>({text})));}
