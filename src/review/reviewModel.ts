import type { NoteEditorObject, ReviewReply } from "../types/editor";
export type ReviewStatus = "open" | "in-progress" | "resolved";
export function reviewStatus(note: Pick<NoteEditorObject, "resolved" | "reviewStatus">): ReviewStatus {
  return note.reviewStatus ?? (note.resolved ? "resolved" : "open");
}
export function reviewReply(author: string, contents: string, id = crypto.randomUUID(), createdAt = Date.now()): ReviewReply {
  const trimmed = contents.trim();
  if (!trimmed || trimmed.length > 4_000) throw new Error("Replies must contain 1–4,000 characters.");
  if (!author.trim() || author.length > 120) throw new Error("Reply author is required (maximum 120 characters).");
  return { id, author: author.trim(), contents: trimmed, createdAt };
}
export function validateReviewNote(note: NoteEditorObject): void {
  const replies = note.replies ?? [];
  if (replies.length > 100) throw new Error("A single comment supports at most 100 replies.");
  const ids = new Set<string>();
  if (!(["open", "in-progress", "resolved"] as string[]).includes(reviewStatus(note))) throw new Error("Review status is invalid.");
  for (const reply of replies) {
    if (!reply.id || ids.has(reply.id)) throw new Error("Reply identifiers must be unique and nonempty.");
    ids.add(reply.id);
    if (!reply.author?.trim() || !reply.contents?.trim() || reply.contents.length > 4000 || !Number.isFinite(reply.createdAt)) throw new Error("Comment reply is malformed.");
  }
}
export function reviewAnnotationCount(note: Pick<NoteEditorObject, "replies">): number { return 1 + (note.replies?.length ?? 0); }
