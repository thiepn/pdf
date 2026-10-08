import { useEffect, useState } from "react";
import type { NoteEditorObject } from "../types/editor";
import { reviewReply, reviewStatus } from "./reviewModel";

interface Props {
  note: NoteEditorObject;
  onPatch: (changes: Partial<NoteEditorObject>, label?: string, mergeKey?: string) => void;
}
export function ReviewThreadControls({ note, onPatch }: Props) {
  const [draft, setDraft] = useState("");
  const [replyAuthor, setReplyAuthor] = useState(note.author);
  useEffect(() => { setReplyAuthor(note.author); setDraft(""); }, [note.id]);
  const [error, setError] = useState("");
  function addReply(): void {
    try {
      const reply = reviewReply(replyAuthor, draft);
      if ((note.replies?.length ?? 0) >= 100) throw new Error("This thread already has 100 replies.");
      onPatch({ replies: [...(note.replies ?? []), reply] }, "Reply to comment", undefined);
      setDraft("");
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  return <section className="property-section f3-review-thread">
    <h3>Review thread</h3>
    <label className="property-field"><span>Status</span><select aria-label="Review status" value={reviewStatus(note)} onChange={(event) => {
      const status = event.target.value as "open" | "in-progress" | "resolved";
      onPatch({ reviewStatus: status, resolved: status === "resolved" }, "Change review status", undefined);
    }}>
      <option value="open">Open</option><option value="in-progress">In progress</option><option value="resolved">Resolved</option>
    </select></label>
    <ol className="f3-reply-list">
      {(note.replies ?? []).map((reply) => <li key={reply.id}><strong>{reply.author}</strong><time dateTime={new Date(reply.createdAt).toISOString()}>{new Date(reply.createdAt).toLocaleDateString()}</time><p>{reply.contents}</p></li>)}
    </ol>
    <label className="property-field"><span>Reply as</span><input aria-label="Reply author" maxLength={120} value={replyAuthor} onChange={(event) => setReplyAuthor(event.target.value)} /></label>
    <label className="property-field"><span>Write a reply</span><textarea aria-label="Review reply" maxLength={4000} rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add context or next steps…" /></label>
    {error ? <p role="alert" className="property-note">{error}</p> : null}
    <button type="button" disabled={!draft.trim()} onClick={addReply}>Add reply</button>
    <p className="property-note">Replies are exported as PDF comment annotations linked to the original via /IRT. Statuses are saved in PDF Studio; resolved is exported using the standard PDF review state.</p>
  </section>;
}
