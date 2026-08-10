export type PreservationCategory = "pages"|"text"|"images"|"vectors"|"fonts"|"annotations"|"forms"|"links"|"bookmarks"|"attachments"|"layers"|"metadata"|"signatures"|"tags"|"encryption";
export type PreservationDisposition = "preserve"|"modify"|"flatten"|"remove"|"unsupported"|"unknown";
export interface GraphCounts { pages:number;text:number;images:number;vectors:number;fonts:number;annotations:number;forms:number;links:number;bookmarks:number;attachments:number;layers:number;metadata:number;signatures:number;tags:number;encryption:number }

export interface PreservationObjectFingerprint {
  id: string;
  category: PreservationCategory;
  digest: string;
  pageNumber?: number;
  summary?: string;
}

export type PreservationObjectMap = Record<PreservationCategory, PreservationObjectFingerprint[]>;
export type PreservationCategoryDigests = Record<PreservationCategory, string>;

export interface PreservationGraph {
  graphVersion: 2;
  pageCount:number;
  counts:GraphCounts;
  encrypted:boolean;
  tagged:boolean;
  metadata:Record<string,string>;
  objects: PreservationObjectMap;
  fingerprints: PreservationCategoryDigests;
  warnings:string[];
}
export interface PreservationContractReport { operation:string; contract:Record<PreservationCategory,PreservationDisposition>; source:PreservationGraph; output?:PreservationGraph; passed:boolean; failures:string[]; warnings:string[]; durationMs:number }
export interface PreservationResult { bytes:Uint8Array; report:PreservationContractReport }
export interface OcrOverlayWord { text:string; x:number;y:number;w:number;h:number;confidence:number }
export interface OcrOverlayPage { pageNumber:number; words:OcrOverlayWord[] }
export interface ImpositionSettings { layout:"2-up"|"4-up"; pageSize:"a4"|"letter"; margin:number; gutter:number; borders:boolean }
export interface ImageOptimizationSettings { subsetFonts:boolean; removeMetadata:boolean }
