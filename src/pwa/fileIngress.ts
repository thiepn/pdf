export type IncomingFileKind = "pdf" | "package";

export function classifyIncomingFile(name: string, type = ""): IncomingFileKind | null {
  const normalizedName = name.trim().toLowerCase();
  const normalizedType = type.trim().toLowerCase();
  if (normalizedName.endsWith(".lpsproject") || normalizedType === "application/x-local-pdf-studio-project") return "package";
  if (normalizedName.endsWith(".pdf") || normalizedType === "application/pdf") return "pdf";
  return null;
}
