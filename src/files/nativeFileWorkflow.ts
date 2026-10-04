import { idbDelete, idbGet, idbPut } from "../storage/database";

export type NativePermissionState = "granted" | "denied" | "prompt";

export interface NativeWritableFileStream {
  write(data: Blob | Uint8Array | string): Promise<void>;
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
  sourceSize?: number;
  sourceLastModified?: number;
  outputName?: string;
  outputSize?: number;
  outputLastModified?: number;
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

export interface PreparedNativePdfWrite {
  handle: NativeFileHandle;
  filename: string;
  target: "output" | "source";
}

const PDF_TYPE = [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }];
const bindingCache = new Map<string, NativeFileBindingRecord | null>();

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
  if (bindingCache.has(projectId)) return bindingCache.get(projectId) ?? undefined;
  const binding = await idbGet<NativeFileBindingRecord>("nativeFileBindings", projectId);
  bindingCache.set(projectId, binding ?? null);
  return binding;
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
  const [current, file] = await Promise.all([readNativeFileBinding(projectId), handle.getFile()]);
  const next: NativeFileBindingRecord = {
    ...current,
    projectId,
    sourceHandle: handle,
    sourceName: handle.name,
    sourceSize: file.size,
    sourceLastModified: file.lastModified,
    updatedAt: Date.now()
  };
  await idbPut<NativeFileBindingRecord>("nativeFileBindings", next);
  bindingCache.set(projectId, next);
}

export async function clearNativeFileBinding(projectId: string): Promise<void> {
  await idbDelete("nativeFileBindings", projectId);
  bindingCache.delete(projectId);
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

async function requestWritePermission(handle: NativeFileHandle | NativeDirectoryHandle): Promise<boolean> {
  const ask = handle.requestPermission;
  if (ask) return (await ask.call(handle, { mode: "readwrite" })) === "granted";
  return ensureWritePermission(handle, true);
}

async function assertExternalFileUnchanged(handle: NativeFileHandle, size?: number, lastModified?: number): Promise<void> {
  if (size === undefined || lastModified === undefined) return;
  const current = await handle.getFile();
  if (current.size !== size || current.lastModified !== lastModified) {
    throw new Error(`“${handle.name}” changed outside PDF Studio since it was linked. Reopen that file or use Save as so external changes are not overwritten.`);
  }
}

async function writeFile(handle: NativeFileHandle, data: Blob | Uint8Array, permissionPrepared = false): Promise<void> {
  if (!permissionPrepared && !(await ensureWritePermission(handle, true))) throw new Error("Write permission was not granted for this file.");
  const writable = await handle.createWritable();
  try {
    await writable.write(data instanceof Blob ? data : data.slice());
  } finally {
    await writable.close();
  }
}

async function rememberOutput(projectId: string, handle: NativeFileHandle, savedAt: number): Promise<void> {
  const [current, file] = await Promise.all([readNativeFileBinding(projectId), handle.getFile()]);
  const next: NativeFileBindingRecord = {
    ...current,
    projectId,
    outputHandle: handle,
    outputName: handle.name,
    outputSize: file.size,
    outputLastModified: file.lastModified,
    lastPdfSavedAt: savedAt,
    updatedAt: savedAt
  };
  await idbPut<NativeFileBindingRecord>("nativeFileBindings", next);
  bindingCache.set(projectId, next);
}

export async function prepareNativePdfWrite(
  projectId: string,
  suggestedName: string,
  mode: "save" | "save-as" | "replace-source"
): Promise<PreparedNativePdfWrite | null> {
  if (mode === "replace-source") {
    const binding = await readNativeFileBinding(projectId);
    if (!binding?.sourceHandle) throw new Error("This project is not linked to the PDF file it was opened from. Use Save as instead.");
    if (!(await requestWritePermission(binding.sourceHandle))) throw new Error("Write permission was not granted for the original PDF.");
    await assertExternalFileUnchanged(binding.sourceHandle, binding.sourceSize, binding.sourceLastModified);
    return { handle: binding.sourceHandle, filename: binding.sourceHandle.name, target: "source" };
  }

  if (!supportsNativeFileSave()) return null;
  const picker = pickerWindow().showSaveFilePicker;
  if (!picker) return null;
  if (mode === "save-as") {
    const handle = await picker({ suggestedName: safeNativePdfName(suggestedName), excludeAcceptAllOption: false, types: PDF_TYPE });
    return { handle, filename: handle.name, target: "output" };
  }

  const binding = await readNativeFileBinding(projectId);
  if (binding?.outputHandle) {
    if (!(await requestWritePermission(binding.outputHandle))) throw new Error("Write permission was not granted for the saved PDF.");
    await assertExternalFileUnchanged(binding.outputHandle, binding.outputSize, binding.outputLastModified);
    return { handle: binding.outputHandle, filename: binding.outputHandle.name, target: "output" };
  }
  const handle = await picker({ suggestedName: safeNativePdfName(suggestedName), excludeAcceptAllOption: false, types: PDF_TYPE });
  return { handle, filename: handle.name, target: "output" };
}

export async function commitPreparedNativePdfWrite(
  projectId: string,
  prepared: PreparedNativePdfWrite,
  bytes: Uint8Array
): Promise<NativePdfWriteResult> {
  await writeFile(prepared.handle, bytes, true);
  const savedAt = Date.now();
  if (prepared.target === "output") await rememberOutput(projectId, prepared.handle, savedAt);
  else {
    const binding = await readNativeFileBinding(projectId);
    if (!binding?.sourceHandle) throw new Error("The original PDF link was lost before the verified output could be written.");
    const file = await prepared.handle.getFile();
    const next: NativeFileBindingRecord = {
      ...binding,
      projectId,
      sourceSize: file.size,
      sourceLastModified: file.lastModified,
      lastPdfSavedAt: savedAt,
      updatedAt: savedAt
    };
    await idbPut<NativeFileBindingRecord>("nativeFileBindings", next);
    bindingCache.set(projectId, next);
  }
  return { filename: prepared.filename, target: prepared.target, savedAt };
}

export async function savePdfAsNative(projectId: string, bytes: Uint8Array, suggestedName: string): Promise<NativePdfWriteResult | null> {
  const prepared = await prepareNativePdfWrite(projectId, suggestedName, "save-as");
  return prepared ? commitPreparedNativePdfWrite(projectId, prepared, bytes) : null;
}

export async function savePdfToNativeTarget(projectId: string, bytes: Uint8Array, suggestedName: string): Promise<NativePdfWriteResult | null> {
  const prepared = await prepareNativePdfWrite(projectId, suggestedName, "save");
  return prepared ? commitPreparedNativePdfWrite(projectId, prepared, bytes) : null;
}

export async function replaceNativeSource(projectId: string, bytes: Uint8Array): Promise<NativePdfWriteResult> {
  const prepared = await prepareNativePdfWrite(projectId, "document.pdf", "replace-source");
  if (!prepared) throw new Error("Native file replacement is unavailable.");
  return commitPreparedNativePdfWrite(projectId, prepared, bytes);
}

export async function chooseExternalBackupDirectory(projectId: string): Promise<NativeFileStatus | null> {
  const picker = pickerWindow().showDirectoryPicker;
  if (!picker) return null;
  const handle = await picker({ mode: "readwrite" });
  if (!(await ensureWritePermission(handle, true))) throw new Error("Write permission was not granted for this backup folder.");
  const current = await readNativeFileBinding(projectId);
  const next: NativeFileBindingRecord = {
    ...current,
    projectId,
    backupDirectoryHandle: handle,
    updatedAt: Date.now()
  };
  await idbPut<NativeFileBindingRecord>("nativeFileBindings", next);
  bindingCache.set(projectId, next);
  return readNativeFileStatus(projectId);
}

export async function authorizeExternalBackupDirectory(projectId: string): Promise<boolean> {
  const binding = await readNativeFileBinding(projectId);
  if (!binding?.backupDirectoryHandle) return false;
  return requestWritePermission(binding.backupDirectoryHandle);
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
  const next: NativeFileBindingRecord = {
    ...binding,
    projectId,
    lastBackupAt: now,
    updatedAt: now
  };
  await idbPut<NativeFileBindingRecord>("nativeFileBindings", next);
  bindingCache.set(projectId, next);
  return true;
}
