export const WORKSPACE_SCHEMA_VERSION = 1;

export type WorkspaceMode =
  | "viewer"
  | "editor"
  | "organizer"
  | "secure"
  | "ocr"
  | "compress"
  | "inspector"
  | "repair"
  | "professional"
  | "preservation"
  | "native"
  | "compliance"
  | "toolbox";

export interface WorkspaceTab {
  projectId: string;
  pinned: boolean;
  lastMode: WorkspaceMode;
  openedAt: number;
  lastActivatedAt: number;
}

export interface ClosedWorkspaceTab extends WorkspaceTab {
  closedAt: number;
}

export interface WorkspaceSession {
  id: "primary";
  schemaVersion: number;
  activeProjectId?: string;
  tabs: WorkspaceTab[];
  recentlyClosed: ClosedWorkspaceTab[];
  timelineOpen: boolean;
  preservationOpen: boolean;
  updatedAt: number;
}

export type WorkspaceEventType =
  | "tab-opened"
  | "tab-closed"
  | "tab-restored"
  | "mode-changed"
  | "checkpoint-created"
  | "checkpoint-restored";

export interface WorkspaceEvent {
  id: string;
  projectId: string;
  type: WorkspaceEventType;
  label: string;
  mode?: WorkspaceMode;
  createdAt: number;
}

export interface WorkspaceCheckpoint {
  id: string;
  projectId: string;
  projectName: string;
  label: string;
  createdAt: number;
  packageBytes: ArrayBuffer;
  byteLength: number;
}

export interface PreservationContract {
  mode: WorkspaceMode;
  summary: string;
  preserves: string[];
  changes: string[];
  risks: string[];
  destructive: boolean;
}
