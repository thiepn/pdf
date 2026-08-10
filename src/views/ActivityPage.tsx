import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { clearActivityReceipts, listActivityReceipts } from "../activity/activityRepository";
import { receiptToCsvRow, type ActivityReceipt } from "../activity/activityModel";
import { downloadBlob } from "../projects/download";
import { readSettings } from "../settings/settingsStore";

export function ActivityPage() {
  const [receipts, setReceipts] = useState<ActivityReceipt[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading download history…");

  async function refresh(): Promise<void> {
    const items = await listActivityReceipts();
    setReceipts(items);
    setStatus(items.length ? `${items.length} recorded download(s)` : "No recorded downloads yet");
  }

  useEffect(() => { void refresh().catch((reason) => setStatus(reason instanceof Error ? reason.message : String(reason))); }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? receipts.filter((item) => `${item.filename} ${item.kind} ${item.sha256}`.toLowerCase().includes(needle)) : receipts;
  }, [receipts, query]);

  function exportJson(): void {
    const report = { schemaVersion: 1, exportedAt: new Date().toISOString(), receipts };
    downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), "pdf-studio-activity.json", { track: false });
  }

  function exportCsv(): void {
    const header = "createdAt,kind,filename,mimeType,byteLength,sha256,route,releaseVersion";
    const csv = [header, ...receipts.map(receiptToCsvRow)].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), "pdf-studio-activity.csv", { track: false });
  }

  async function clearAll(): Promise<void> {
    if (readSettings().confirmDestructive && !window.confirm("Delete the entire local download history? This does not delete PDF files or projects.")) return;
    await clearActivityReceipts();
    await refresh();
  }

  return <div className="activity-page stack">
    <section className="release-section activity-hero"><header><div><p className="eyebrow">Download history</p><h2>Files created by PDF Studio</h2><p>When enabled in Settings, this page records the filename, type, size, and a file fingerprint so you can identify past exports. It never stores another copy of the document.</p></div><div className="button-row"><button className="button button--secondary" disabled={!receipts.length} onClick={exportJson} type="button">Export JSON</button><button className="button button--secondary" disabled={!receipts.length} onClick={exportCsv} type="button">Export CSV</button><button className="button button--ghost" disabled={!receipts.length} onClick={() => void clearAll()} type="button">Clear history</button></div></header>
      <div className="activity-controls"><input aria-label="Search download history" onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search filename or file type" value={query}/><span>{status}</span></div>
    </section>
    <section className="activity-list" aria-live="polite">{visible.length ? visible.map((receipt) => <article key={receipt.id}><div><strong>{receipt.filename}</strong><span>{receipt.kind} · {(receipt.byteLength / 1024 / 1024).toFixed(2)} MB · {receipt.mimeType}</span></div><time dateTime={new Date(receipt.createdAt).toISOString()}>{new Date(receipt.createdAt).toLocaleString()}</time><details><summary>File fingerprint</summary><code title={receipt.sha256}>{receipt.sha256}</code><button className="button button--tiny button--ghost" onClick={() => void navigator.clipboard?.writeText(receipt.sha256)} type="button">Copy fingerprint</button></details></article>) : <div className="empty-state"><strong>No matching downloads</strong><p>Downloads appear here when download history is enabled in Settings.</p></div>}</section>
  </div>;
}
