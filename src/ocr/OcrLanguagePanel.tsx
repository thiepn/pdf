import { useEffect, useRef, useState } from "react";
import type { InstalledOcrLanguage } from "../types/ocr";
import { COMMON_OCR_LANGUAGES, importLanguagePack, installLanguageFromNetwork, removeLanguagePack } from "./languagePackManager";
import { listInstalledLanguages } from "./ocrRepository";

interface Props {
  selected: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
}

export function OcrLanguagePanel({ selected, onChange, disabled = false }: Props) {
  const [installed, setInstalled] = useState<InstalledOcrLanguage[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const importCodeRef = useRef("eng");

  async function refresh() { setInstalled(await listInstalledLanguages()); }
  useEffect(() => {
    void refresh();
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const installedCodes = new Set(installed.map((item) => item.code));

  async function download(code: string) {
    setBusy(code); setError(null);
    try { await installLanguageFromNetwork(code); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  }

  async function remove(code: string) {
    setBusy(code); setError(null);
    try { await removeLanguagePack(code); onChange(selected.filter((item) => item !== code)); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  }

  async function importFile(file: File) {
    const code = importCodeRef.current;
    setBusy(code); setError(null);
    try { await importLanguagePack(code, file); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  }

  return <section className="ocr-language-panel">
    <div className="section-heading"><div><p className="eyebrow">Languages</p><h3>Installed OCR data</h3></div><span>{installed.length} installed</span></div>
    <p className="muted-copy">Language files are downloaded only when selected and then stored locally for offline use. You can also import a traineddata.gz file. {online ? "" : "Network installation is unavailable while offline; installed/imported packs still work."}</p>
    {error ? <div className="error-banner"><strong>Language pack error</strong><span>{error}</span></div> : null}
    <div className="ocr-language-grid">
      {COMMON_OCR_LANGUAGES.map((language) => {
        const ready = installedCodes.has(language.code);
        const active = selected.includes(language.code);
        return <div className={active ? "ocr-language-card ocr-language-card--active" : "ocr-language-card"} key={language.code}>
          <label><input checked={active} disabled={!ready || disabled} onChange={() => onChange(active ? selected.filter((item) => item !== language.code) : [...selected, language.code])} type="checkbox"/><span><strong>{language.label}</strong><small>{language.code}</small></span></label>
          {ready ? <button className="button button--tiny button--ghost" disabled={disabled || busy === language.code} onClick={() => void remove(language.code)} type="button">Remove</button>
            : <button className="button button--tiny" disabled={disabled || Boolean(busy) || !online} onClick={() => void download(language.code)} type="button">{busy === language.code ? "Installing…" : online ? "Install" : "Offline"}</button>}
        </div>;
      })}
    </div>
    <div className="language-import-row">
      <select disabled={disabled || Boolean(busy)} onChange={(event) => { importCodeRef.current = event.target.value; }} defaultValue="eng">{COMMON_OCR_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select>
      <button className="button button--secondary" disabled={disabled || Boolean(busy)} onClick={() => fileRef.current?.click()} type="button">Import traineddata.gz</button>
      <input ref={fileRef} accept=".gz,application/gzip,application/octet-stream" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} type="file" />
    </div>
  </section>;
}
