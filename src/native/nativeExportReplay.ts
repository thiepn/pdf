import type { NativeEdit } from "../types/nativeEditor";

export interface NativeExportReplay {
  sourceBytes: Uint8Array;
  edits: NativeEdit[];
  password?: string;
}

const replayByOutput = new WeakMap<Uint8Array, NativeExportReplay>();

export function rememberNativeExportReplay(outputBytes: Uint8Array, replay: NativeExportReplay): void {
  replayByOutput.set(outputBytes, replay);
}

export function takeNativeExportReplay(outputBytes: Uint8Array): NativeExportReplay | undefined {
  const replay = replayByOutput.get(outputBytes);
  if (!replay) return undefined;
  replayByOutput.delete(outputBytes);
  return replay;
}
