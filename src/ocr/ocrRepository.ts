import { idbDelete, idbGet, idbGetAll, idbGetAllByIndex, idbPut } from "../storage/database";
import { OCR_SCHEMA_VERSION, type InstalledOcrLanguage, type OcrJob, type OcrPageResult } from "../types/ocr";
import { assertReadableStateSchema } from "../projects/stateSchemaGuard";

function assertReadableOcrJob(job: OcrJob): OcrJob {
  assertReadableStateSchema(job.schemaVersion, OCR_SCHEMA_VERSION, `OCR job “${String(job.id ?? "unknown")}”`);
  return job;
}

export async function readOcrJob(jobId: string): Promise<OcrJob | undefined> {
  const job = await idbGet<OcrJob>("ocrJobs", jobId);
  return job ? assertReadableOcrJob(job) : undefined;
}

export async function writeOcrJob(job: OcrJob): Promise<void> {
  assertReadableStateSchema(job.schemaVersion, OCR_SCHEMA_VERSION, `OCR job “${String(job.id ?? "unknown")}”`);
  await idbPut("ocrJobs", { ...job, schemaVersion: OCR_SCHEMA_VERSION, updatedAt: Date.now() });
}

export async function listOcrJobs(projectId?: string): Promise<OcrJob[]> {
  const jobs = projectId
    ? await idbGetAllByIndex<OcrJob>("ocrJobs", "projectId", projectId)
    : await idbGetAll<OcrJob>("ocrJobs");
  return jobs.map(assertReadableOcrJob).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteOcrJob(jobId: string): Promise<void> {
  const pages = await listOcrPages(jobId);
  await Promise.all(pages.map((page) => idbDelete("ocrPages", page.id)));
  await idbDelete("ocrJobs", jobId);
}

export async function readOcrPage(jobId: string, pageNumber: number): Promise<OcrPageResult | undefined> {
  return idbGet<OcrPageResult>("ocrPages", `${jobId}:${pageNumber}`);
}

export async function writeOcrPage(page: OcrPageResult): Promise<void> {
  await idbPut("ocrPages", { ...page, updatedAt: Date.now() });
}

export async function listOcrPages(jobId: string): Promise<OcrPageResult[]> {
  const pages = await idbGetAllByIndex<OcrPageResult>("ocrPages", "jobId", jobId);
  return pages.sort((a, b) => a.pageNumber - b.pageNumber);
}

export async function listInstalledLanguages(): Promise<InstalledOcrLanguage[]> {
  return (await idbGetAll<InstalledOcrLanguage>("ocrLanguages")).sort((a, b) => a.label.localeCompare(b.label));
}

export async function writeInstalledLanguage(language: InstalledOcrLanguage): Promise<void> {
  await idbPut("ocrLanguages", language);
}

export async function deleteInstalledLanguageRecord(code: string): Promise<void> {
  await idbDelete("ocrLanguages", code);
}
