export const DESKTOP_BRIDGE_VERSION = 1;

export interface DesktopCapabilitySet {
  openFiles: boolean;
  saveFile: boolean;
  nativePrint: boolean;
  certificateStore: boolean;
  scanner: boolean;
  shellIntegration: boolean;
}

export interface DesktopBridgeInfo {
  bridgeVersion: number;
  host: string;
  hostVersion: string;
  platform: string;
  capabilities: DesktopCapabilitySet;
}

export interface LocalPdfStudioDesktopBridge {
  getInfo(): Promise<DesktopBridgeInfo>;
  openPdfFiles?(): Promise<Array<{ name: string; bytes: ArrayBuffer }>>;
  saveFile?(name: string, mimeType: string, bytes: ArrayBuffer): Promise<void>;
  printPdf?(bytes: ArrayBuffer): Promise<void>;
  listSigningCertificates?(): Promise<Array<{ id: string; label: string; issuer?: string; expiresAt?: string }>>;
  signPdfDigest?(certificateId: string, digest: ArrayBuffer, algorithm: string): Promise<ArrayBuffer>;
  scanPages?(): Promise<Array<{ mimeType: string; bytes: ArrayBuffer }>>;
}

declare global {
  interface Window { __LOCAL_PDF_STUDIO_DESKTOP__?: LocalPdfStudioDesktopBridge }
}

export function getDesktopBridge(): LocalPdfStudioDesktopBridge | null {
  return window.__LOCAL_PDF_STUDIO_DESKTOP__ ?? null;
}

export async function inspectDesktopBridge(): Promise<DesktopBridgeInfo | null> {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  const info = await bridge.getInfo();
  if (info.bridgeVersion !== DESKTOP_BRIDGE_VERSION) throw new Error(`Desktop bridge version ${info.bridgeVersion} is incompatible with browser contract ${DESKTOP_BRIDGE_VERSION}.`);
  return info;
}
