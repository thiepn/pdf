import type { PreservationContract, WorkspaceMode } from "../types/workspace";

const contracts: Record<WorkspaceMode, PreservationContract> = {
  viewer: {
    mode: "viewer",
    summary: "Read, search, inspect, and navigate without modifying the PDF.",
    preserves: ["All source PDF bytes", "Forms, annotations, links, layers, and signatures", "Original encryption"],
    changes: ["Viewer preferences are stored locally"],
    risks: [],
    destructive: false
  },
  editor: {
    mode: "editor",
    summary: "Unified editor for existing PDF content, interactive forms, annotations, and newly added objects.",
    preserves: ["Original source project", "Unchanged pages and regions", "Interactive form structure for supported field-value edits"],
    changes: ["Selected text, images, simple vectors, detected table cells, form values, annotations, and added editor objects"],
    risks: ["Existing text and vector edits reconstruct selected regions rather than mutating original operators byte-for-byte", "Complex-script text uses an appearance-only fallback until a shaping engine is available", "Overlapping content can be removed by permanent image replacement"],
    destructive: true
  },
  organizer: {
    mode: "organizer",
    summary: "Rebuilds the page tree to reorder, duplicate, remove, rotate, or extract pages.",
    preserves: ["Visible page appearance", "Page resources and most page annotations", "Source metadata where supported"],
    changes: ["Page order, count, and rotation"],
    risks: ["Bookmarks, signatures, attachments, JavaScript, and complex form relationships may not survive"],
    destructive: true
  },
  secure: {
    mode: "secure",
    summary: "Applies forms, permanent redactions, sanitization, flattening, and encryption in a separate validated copy.",
    preserves: ["Original project", "Unaffected visible page content"],
    changes: ["Security state, forms, metadata, active content, annotations, or underlying page content"],
    risks: ["Digital signatures may become invalid", "Permanent redaction and flattening cannot be undone in the exported copy"],
    destructive: true
  },
  ocr: {
    mode: "ocr",
    summary: "Recognizes scanned pages locally and creates searchable output.",
    preserves: ["Original project and source bytes"],
    changes: ["Creates searchable PDF pages and OCR text data"],
    risks: ["Current searchable output may reconstruct pages as raster pages", "Forms, links, layers, signatures, and vectors may be lost in OCR output"],
    destructive: true
  },
  compress: {
    mode: "compress",
    summary: "Optimizes PDF structure or creates a raster-compressed copy.",
    preserves: ["Original project", "Page count and visible appearance under the selected profile"],
    changes: ["File structure, image resolution, metadata, and output size"],
    risks: ["Raster profiles remove vector editability and interactive structures", "Aggressive settings may reduce visual quality"],
    destructive: true
  },
  inspector: {
    mode: "inspector",
    summary: "Analyzes document structure without changing the PDF.",
    preserves: ["All source data"],
    changes: ["Creates a local inspection report only"],
    risks: [],
    destructive: false
  },
  repair: {
    mode: "repair",
    summary: "Attempts to rewrite damaged structures into a new clean copy.",
    preserves: ["Original source file", "Recoverable visible pages and resources"],
    changes: ["Cross-reference tables, object streams, malformed structures, or page content when raster fallback is required"],
    risks: ["Severely damaged objects may be discarded", "Signatures may be invalidated", "Some pages may require rasterization"],
    destructive: true
  },
  professional: {
    mode: "professional",
    summary: "Edits existing content, adds document numbering, controls document layers, prepares print layouts, and exports structured formats.",
    preserves: ["Original project", "Unaffected page content"],
    changes: ["Existing text or image regions, page content streams, labels, layers, or output layout"],
    risks: ["Unsupported fonts and scripts may use a limited visual fallback", "Print-layout and conversion workflows may have documented fidelity limits"],
    destructive: true
  },
  preservation: {
    mode: "preservation", summary: "Shows what a tool is expected to preserve, change, or rebuild before creating a new PDF copy.",
    preserves: ["Protected document structures are compared before and after export", "Original page graphics remain vector where supported"],
    changes: ["Selected structural optimization or print-layout output"],
    risks: ["Print-layout output cannot remap interactive objects to new sheet positions"], destructive: true
  },
  native: {
    mode: "native", summary: "Legacy route retained for compatibility; redirects to the unified editor.",
    preserves: ["Original project", "Legacy workspace links and checkpoints"],
    changes: ["No independent native-edit state is introduced"],
    risks: ["Existing queued edits are opened and applied by the unified editor"], destructive: true
  },
  compliance: {
    mode: "compliance", summary: "Checks document standards, prepares archive-ready PDF/A candidates, repairs supported accessibility structure, and analyzes how much of the file an existing signature covers.",
    preserves: ["Original project and revision", "Unmodified page graphics unless forms are flattened", "Existing semantic structure except explicitly queued repairs/reordering"],
    changes: ["Forms and tooltips", "Document/XMP metadata", "unsafe automatic actions", "output intent", "supported structure-element Alt/Lang values", "top-level structure order", "optional flattening", "encryption for PDF/A candidates"],
    risks: ["PDF/A conformance still requires an independent validator", "PDF/UA requires semantic content tagging beyond metadata repair", "Rewriting a signed PDF can invalidate existing signatures", "Certificate trust and advanced digital-signature validation require a qualified verification service"], destructive: true
  },
  toolbox: {
    mode: "toolbox", summary: "Applies reusable document utilities and exports local conversions from the current project.",
    preserves: ["Original project and revision", "Unchanged page resources and interactive structures for non-raster transforms"],
    changes: ["Crop boxes, inserted blank pages, static decorations, document metadata, or exported derivative formats"],
    risks: ["Cropping does not erase hidden content outside the CropBox", "Text/HTML/Markdown exports preserve extracted text, not original layout", "PNG and grayscale exports are raster output", "Split ZIP export creates independent PDF parts and does not preserve one-document relationships across parts", "Rewriting or splitting a digitally signed PDF can invalidate existing signatures"], destructive: true
  }
};

export function getPreservationContract(mode: WorkspaceMode): PreservationContract {
  return contracts[mode];
}
