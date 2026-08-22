import type { IconName } from "../components/Icon";
import type { AppRoute } from "../core/appRouter";
import type { WorkspaceMode } from "../types/workspace";

export type TaskCategoryId =
  | "create"
  | "edit"
  | "pages"
  | "protect"
  | "convert"
  | "review"
  | "automate";

export type TaskAudience = "everyday" | "advanced" | "recovery";

export interface PdfTask {
  id: string;
  label: string;
  description: string;
  keywords: string;
  category: TaskCategoryId;
  audience: TaskAudience;
  icon: IconName;
  target: { kind: "workspace"; mode: WorkspaceMode } | { kind: "route"; route: AppRoute };
}

export interface TaskCategory {
  id: TaskCategoryId;
  label: string;
  description: string;
}

export const taskCategories: TaskCategory[] = [
  { id: "create", label: "Create & combine", description: "Start a PDF, scan pages, or combine documents." },
  { id: "edit", label: "Edit & annotate", description: "Change PDF content, add material, sign visually, or review with markup." },
  { id: "pages", label: "Pages", description: "Reorder, split, crop, extract, or add pages." },
  { id: "protect", label: "Protect & sign", description: "Fill forms, redact permanently, sanitize, or password-protect a PDF." },
  { id: "convert", label: "Convert & optimize", description: "OCR scans, reduce file size, export content, or convert page appearance." },
  { id: "review", label: "Review & accessibility", description: "Compare documents, check accessibility, print preparation, and standards-related details." },
  { id: "automate", label: "Automate", description: "Apply repeatable workflows to several PDFs." }
];

export const pdfTasks: PdfTask[] = [
  { id: "create-pdf", label: "Create PDF", description: "Create a PDF from Markdown, plain text, or simple HTML.", keywords: "make author markdown text html new document", category: "create", audience: "everyday", icon: "create", target: { kind: "route", route: { name: "create" } } },
  { id: "merge-pdfs", label: "Merge PDFs", description: "Combine complete PDFs in a chosen order.", keywords: "combine join append multiple documents", category: "create", audience: "everyday", icon: "merge", target: { kind: "route", route: { name: "merge" } } },
  { id: "scan-to-pdf", label: "Scan to PDF", description: "Turn images or camera captures into a PDF, optionally with OCR.", keywords: "camera images photos searchable scan document", category: "create", audience: "everyday", icon: "scan", target: { kind: "route", route: { name: "scan" } } },

  { id: "edit-pdf", label: "Edit PDF", description: "Edit supported existing text, images, vectors, tables, and added objects.", keywords: "change text image content replace move resize table vector", category: "edit", audience: "everyday", icon: "edit", target: { kind: "workspace", mode: "editor" } },
  { id: "annotate-pdf", label: "Annotate & comment", description: "Highlight, draw, add notes, shapes, stamps, and other review markup.", keywords: "highlight comment note markup draw ink underline strikeout stamp shape", category: "edit", audience: "everyday", icon: "edit", target: { kind: "workspace", mode: "editor" } },
  { id: "visual-signature", label: "Add visual signature", description: "Place an appearance-only signature on the PDF. This is not certificate-backed digital signing.", keywords: "sign signature autograph appearance non cryptographic", category: "edit", audience: "everyday", icon: "edit", target: { kind: "workspace", mode: "editor" } },
  { id: "mark-redaction", label: "Mark areas for redaction", description: "Mark content in Edit, then permanently apply the redactions in Protect.", keywords: "blackout censor redact hide sensitive", category: "edit", audience: "everyday", icon: "edit", target: { kind: "workspace", mode: "editor" } },

  { id: "organize-pages", label: "Organize pages", description: "Reorder, rotate, duplicate, delete, reverse, or extract pages.", keywords: "reorder rotate duplicate delete reverse extract pages thumbnails", category: "pages", audience: "everyday", icon: "pages", target: { kind: "workspace", mode: "organizer" } },
  { id: "split-pdf", label: "Split PDF", description: "Split a document into separate PDF parts.", keywords: "divide separate parts pages zip", category: "pages", audience: "everyday", icon: "pages", target: { kind: "workspace", mode: "toolbox" } },
  { id: "crop-pages", label: "Crop pages", description: "Change the visible page area by adjusting PDF crop margins.", keywords: "trim margins cropbox page size edges", category: "pages", audience: "everyday", icon: "pages", target: { kind: "workspace", mode: "toolbox" } },
  { id: "insert-blank-pages", label: "Insert blank pages", description: "Add new blank pages to the start or end of a document.", keywords: "blank empty insert page", category: "pages", audience: "advanced", icon: "pages", target: { kind: "workspace", mode: "toolbox" } },
  { id: "watermark-numbering", label: "Watermark & page numbers", description: "Add a watermark, header, footer, or page numbers.", keywords: "watermark header footer numbering decorate confidential", category: "pages", audience: "everyday", icon: "toolbox", target: { kind: "workspace", mode: "toolbox" } },

  { id: "fill-forms", label: "Fill PDF forms", description: "Review and fill supported interactive form fields.", keywords: "form fields acroform checkbox input fill", category: "protect", audience: "everyday", icon: "secure", target: { kind: "workspace", mode: "secure" } },
  { id: "apply-redactions", label: "Apply permanent redactions", description: "Permanently apply marked redactions and validate the output.", keywords: "redact blackout remove sensitive permanent privacy", category: "protect", audience: "everyday", icon: "secure", target: { kind: "workspace", mode: "secure" } },
  { id: "sanitize-pdf", label: "Sanitize PDF", description: "Remove risky active content and create a safer derived copy.", keywords: "sanitize javascript actions attachments active content security clean", category: "protect", audience: "everyday", icon: "secure", target: { kind: "workspace", mode: "secure" } },
  { id: "password-protect", label: "Password-protect PDF", description: "Create a password-protected copy with supported PDF encryption settings.", keywords: "encrypt password permissions lock protect", category: "protect", audience: "everyday", icon: "secure", target: { kind: "workspace", mode: "secure" } },
  { id: "flatten-pdf", label: "Flatten supported PDF content", description: "Flatten supported forms or annotations when a static output is required.", keywords: "flatten form annotation static print", category: "protect", audience: "advanced", icon: "secure", target: { kind: "workspace", mode: "secure" } },

  { id: "ocr-pdf", label: "OCR PDF", description: "Recognize printed text in scanned pages and create a searchable PDF.", keywords: "ocr searchable scan recognize text tesseract", category: "convert", audience: "everyday", icon: "ocr", target: { kind: "workspace", mode: "ocr" } },
  { id: "compress-pdf", label: "Compress PDF", description: "Use lossless optimization or stronger image-based compression.", keywords: "compress optimize reduce file size smaller lossless raster", category: "convert", audience: "everyday", icon: "compress", target: { kind: "workspace", mode: "compress" } },
  { id: "metadata", label: "Edit or remove metadata", description: "Change document title, author, subject, keywords, or remove metadata.", keywords: "metadata title author subject keywords privacy remove properties", category: "convert", audience: "everyday", icon: "toolbox", target: { kind: "workspace", mode: "toolbox" } },
  { id: "export-content", label: "Export PDF content", description: "Export text, Markdown, HTML, page images, or split PDF parts locally.", keywords: "convert export text markdown html images png jpeg extract", category: "convert", audience: "everyday", icon: "toolbox", target: { kind: "workspace", mode: "toolbox" } },
  { id: "grayscale-pdf", label: "Create grayscale PDF", description: "Create a grayscale raster copy when appearance matters more than interactive PDF structure.", keywords: "black white monochrome grayscale raster", category: "convert", audience: "advanced", icon: "toolbox", target: { kind: "workspace", mode: "toolbox" } },

  { id: "compare-pdfs", label: "Compare PDFs", description: "Align text or scanned pages and compare them visually or by extracted text.", keywords: "diff compare changes original revised versions", category: "review", audience: "everyday", icon: "compare", target: { kind: "route", route: { name: "compare" } } },
  { id: "accessibility-check", label: "Check accessibility", description: "Review accessibility findings and supported remediation tools.", keywords: "accessibility tags reading order alt text wcag pdf ua", category: "review", audience: "advanced", icon: "compliance", target: { kind: "workspace", mode: "compliance" } },
  { id: "print-layout", label: "Prepare print layout", description: "Create booklet, imposition, and other specialist print layouts.", keywords: "print booklet impose imposition 2-up 4-up sheet", category: "review", audience: "advanced", icon: "professional", target: { kind: "workspace", mode: "professional" } },
  { id: "bates-numbering", label: "Add Bates numbering", description: "Apply document numbering for specialist document workflows.", keywords: "bates legal numbering sequence stamp", category: "review", audience: "advanced", icon: "professional", target: { kind: "workspace", mode: "professional" } },
  { id: "archive-readiness", label: "Check archive readiness", description: "Review PDF/A-related readiness and limitations before external certification.", keywords: "archive archival pdfa pdf/a standards compliance", category: "review", audience: "advanced", icon: "professional", target: { kind: "workspace", mode: "professional" } },

  { id: "batch-automation", label: "Batch automation", description: "Apply a saved sequence of actions to several PDFs.", keywords: "batch multiple many files recipe automate bulk", category: "automate", audience: "advanced", icon: "batch", target: { kind: "route", route: { name: "batch" } } },

  { id: "repair-pdf", label: "Repair PDF", description: "Rewrite a separate clean copy when a PDF is damaged or behaves unexpectedly.", keywords: "repair broken damaged malformed rewrite recover", category: "review", audience: "recovery", icon: "repair", target: { kind: "workspace", mode: "repair" } },
  { id: "document-details", label: "Document technical details", description: "Inspect fonts, images, forms, revisions, actions, signatures, and PDF structure.", keywords: "inspect structure fonts images resources signatures revisions technical report", category: "review", audience: "recovery", icon: "inspect", target: { kind: "workspace", mode: "inspector" } }
];

export function getTask(taskId?: string | null): PdfTask | undefined {
  return taskId ? pdfTasks.find((task) => task.id === taskId) : undefined;
}

export function taskRoute(task: PdfTask, projectId?: string): AppRoute | null {
  if (task.target.kind === "route") return task.target.route;
  if (projectId) return { name: "workspace", projectId, mode: task.target.mode, taskId: task.id };
  return { name: "tools", taskId: task.id };
}

export function taskSearchText(task: PdfTask): string {
  return `${task.label} ${task.description} ${task.keywords}`.toLowerCase();
}

export function tasksForCategory(category: TaskCategoryId, includeRecovery = false): PdfTask[] {
  return pdfTasks.filter((task) => task.category === category && (includeRecovery || task.audience !== "recovery"));
}
