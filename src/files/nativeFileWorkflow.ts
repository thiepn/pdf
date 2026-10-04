import { idbDelete, idbGet, idbPut } from "../storage/database";

export type NativePermissionState = "granted" | "denied" | "prompt";

export interface NativeWritableFileStream {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
}

export interface NativeFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<NativeWritableFileStream>;
  queryPermission?(options?: { mode?: "read" | "readwrite" }): Promise<NativePermissionState>;
  requestPermission?(options?: { mode?: "read" | "readwrite" }): Promise<NativePermissionState>;
}

export interface NativeDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<NativeFileHandle>;
  queryPermission?(options?: { mode?: "read" | "readwrite" }): Promise<NativePermissionState>;
  requestPermission?(options?: { mode?: "read" | "readwrite" }): Promise<NativePermissionState>;
}

interface NativePickerWindow extends Window {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<NativeFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    excludeAcceptAllOption?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<NativeFileHandle>;
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<NativeDirectoryHandle>;
}

export interface NativeFileBindingRecord {
  projectId: string;
  sourceHandle?: NativeFileHandle;
  outputHandle?: NativeFileHandle;
  backupDirectoryHandle?: NativeDirectoryHandle;
  sourceName?: string;
  outputName?: string;
  lastPdfSavedAt?: number;
  lastBackupAt?: number;
  updatedAt: number;
}

export interface NativeFileStatus {
  nativeOpenAvailable: boolean;
  nativeSaveAvailable: boolean;
  directoryBackupAvailable: boolean;
  sourceLinked: boolean;
  sourceName?: string;
  outputLinked: boolean;
  outputName?: string;
  backupFolderLinked: boolean;
  backupFolderName?: string;
  lastPdfSavedAt?: number;
  lastBackupAt?: number;
}

export interface NativeOpenResult {
  file: File;
  handle: NativeFileHandle;
}

export interface NativePdfWriteResult {
  filename: string;
  target: "output" | "source";
  savedAt: number;
}

const PDF_TYPE = [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }];

function pickerWindow(): NativePickerWindow {
  return window as NativePickerWindow;
}

export function supportsNativeFileOpen(): boolean {
  return typeof pickerWindow().showOpenFilePicker === "function";
}

export function supportsNativeFileSave(): boolean {
  return typeof pickerWindow().showSaveFilePicker === "function";
}

export function supportsNativeDirectoryBackup(): boolean {
  return typeof pickerWindow().showDirectoryPicker === "function";
}

export function safeNativePdfName(value: string): string {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]+/g, "-");
  const base = trimmed || "document.pdf";
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

export function safeNativeBackupName(value: string): string {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]+/g, "-");
  const base = trimmed || "local-pdf-project";
  return /\.lpsproject$/i.test(base) ? base : `${base}.lpsproject`;
}

export async function openNativePdf(): Promise<NativeOpenResult | null> {
  const picker = pickerWindow().showOpenFilePicker;
  if (!picker) return null;
  const handles = await picker({ multiple: false, excludeAcceptAllOption: false, types: PDF_TYPE });
  const handle = handles[0];
  if (!handle) return null;
  const file = await handle.getFile();
  if (!/\.pdf$/i.test(file.name) && file.type.toLowerCase() !== "application/pdf") {
    throw new Error("Choose a PDF file.");
  }
  return { file, handle };
}

export async function readNativeFileBinding(projectId: string): Promise<NativeFileBindingRecord | undefined> {
  return idbGet<NativeFileBindingRecord>("nativeFileBindings", projectId);
}

export async function readNativeFileStatus(projectId: string): Promise<NativeFileStatus> {
  const binding = await readNativeFileBinding(projectId);
  return {
    nativeOpenAvailable: supportsNativeFileOpen(),
    nativeSaveAvailable: supportsNativeFileSave(),
    directoryBackupAvailable: supportsNativeDirectoryBackup(),
    sourceLinked: Boolean(binding?.sourceHandle),
    sourceName: binding?.sourceName,
    outputLinked: Boolean(binding?.outputHandle),
    outputName: binding?.outputName,
    backupFolderLinked: Boolean(binding?.backupDirectoryHandle),
    backupFolderName: binding?.backupDirectoryHandle?.name,
    lastPdfSavedAt: binding?.lastPdfSavedAt,
    lastBackupAt: binding?.lastBackupAt
  };
}

export async function rememberNativeSourceHandle(projectId: string, handle: NativeFileHandle): Promise<void> {
  const current = await readNativeFileBinding(projectId);
  await idbPut<NativeFileBindingRecord>("nativeFileBindings", {
    ...current,
    projectId,
    sourceHandle: handle,
    sourceName: handle.name,
    updatedAt: Date.now()
  });
}

export async function clearNativeFileBinding(projectId: string): Promise<void> {
  await idbDelete("nativeFileBindings", projectId);
}

async function ensureWritePermission(handle: NativeFileHandle | NativeDirectoryHandle, request: boolean): Promise<boolean> {
  const query = handle.queryPermission;
  if (query) {
    const state = await query.call(handle, { mode: "readwrite" });
    if (state === "granted") return true;
    if (state === "denied" && !request) return false;
  }
  if (!request) return false;
  const ask = handle.requestPermission;
  if (!ask) return true;
  return (await ask.call(handle, { mode: "readwrite" })) === "granted";
}

async function writeFile(handle: NativeFileHandle, data: Blob | Uint8Array): Promise<void> {
  if (!(await ensureWritePermission(handle, true))) throw new Error("Write permission was not granted for this file.");
  const writable = await handle.createWritable();
  try {
    await writable.write(data instanceof Blob ? data : data.slice());
  } finally {
    await writable.close();
  }
}

async function rememberOutput(projectId: string, handle: NativeFileHandle, savedAt: number): Promise<void> {
  const current = await readNativeFileBinding(projectId);
  await idbPut<NativeFileBindingRecord>("nativeFileBindings", {
    ...current,
    projectId,
    outputHandle: handle,
    outputName: handle.name,
    lastPdfSavedAt: savedAt,
    updatedAt: savedAt
  });
}

export async function savePdfAsNative(projectId: string, bytes: Uint8Array, suggestedName: string): Promise<NativePdfWriteResult | null> {
  const picker = pickerWindow().showSaveFilePicker;
  if (!picker) return null;
  const handle = await picker({ suggestedName: safeNativePdfName(suggestedName), excludeAcceptAllOption: false, types: PDF_TYPE });
  await writeFile(handle, bytes);
  const savedAt = Date.now();
  await rememberOutput(projectId, handle, savedAt);
  return { filename: handle.name, target: "output", savedAt };
}

export async function savePdfToNativeTarget(projectId: string, bytes: Uint8Array, suggestedName: string): Promise<NativePdfWriteResult | null> {
  if (!supportsNativeFileSave()) return null;
  const binding = await readNativeFileBinding(projectId);
  if (!binding?.outputHandle) return savePdfAsNative(projectId, bytes, suggestedName);
  await writeFile(binding.outputHandle, bytes);
  const savedAt = Date.now();
  await rememberOutput(projectId, binding.outputHandle, savedAt);
  return { filename: binding.outputHandle.name, target: "output", savedAt };
}

export async function replaceNativeSource(projectId: string, bytes: Uint8Array): Promise<NativePdfWriteResult> {
  const binding = await readNativeFileBinding(projectId);
  if (!binding?.sourceHandle) throw new Error("This project is not linked to the PDF file it was opened from. Use Save as instead.");
  await writeFile(binding.sourceHandle, bytes);
  const savedAt = Date.now();
  await idbPut<NativeFileBindingRecord>("nativeFileBindings", {
    ...binding,
    projectId,
    lastPdfSavedAt: savedAt,
    updatedAt: savedAt
  });
  return { filename: binding.sourceHandle.name, target: "source", savedAt };
}

export async function chooseExternalBackupDirectory(projectId: string): Promise<NativeFileStatus | null> {
  const picker = pickerWindow().showDirectoryPicker;
  if (!picker) return null;
  const handle = await picker({ mode: "readwrite" });
  if (!(await ensureWritePermission(handle, true))) throw new Error("Write permission was not granted for this backup folder.");
  const current = await readNativeFileBinding(projectId);
  await idbPut<NativeFileBindingRecord>("nativeFileBindings", {
    ...current,
    projectId,
    backupDirectoryHandle: handle,
    updatedAt: Date.now()
  });
  return readNativeFileStatus(projectId);
}

export async function writeExternalProjectBackup(
  projectId: string,
  blob: Blob,
  filename: string,
  options: { requestPermission?: boolean } = {}
): Promise<boolean> {
  const binding = await readNativeFileBinding(projectId);
  const directory = binding?.backupDirectoryHandle;
  if (!directory) return false;
  const allowed = await ensureWritePermission(directory, options.requestPermission === true);
  if (!allowed) return false;
  const handle = await directory.getFileHandle(safeNativeBackupName(filename), { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  const now = Date.now();
  await idbPut<NativeFileBindingRecord>("nativeFileBindings", {
    ...binding,
    projectId,
    lastBackupAt: now,
    updatedAt: now
  });
  return true;
}
