import { useMemo, useState, type ChangeEvent } from "react";
import { helpArticles, keyboardShortcuts } from "../help/helpContent";
import { routeHref } from "../core/appRouter";

export function HelpPage() {
  const [query, setQuery] = useState("");
  const articles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return helpArticles;
    return helpArticles.filter((article) => `${article.title} ${article.category} ${article.summary} ${article.keywords.join(" ")} ${article.steps.join(" ")}`.toLowerCase().includes(needle));
  }, [query]);

  return <div className="help-page stack">
    <section className="help-hero"><div><p className="eyebrow">User guide</p><h2>Find any feature without guessing</h2><p>Search plain-language instructions for everyday tools, advanced workflows, recovery, and keyboard shortcuts. This guide is bundled with the application and remains available offline.</p></div><input aria-label="Search help articles" onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search forms, redaction, OCR, compare, booklet…" value={query}/></section>
    <section className="help-grid">{articles.map((article) => <article id={article.id} key={article.id}><span>{article.category}</span><h3>{article.title}</h3><p>{article.summary}</p><ol>{article.steps.map((step) => <li key={step}>{step}</li>)}</ol></article>)}</section>
    {!articles.length ? <div className="empty-state"><strong>No help article matched</strong><p>Try a broader term or use the command palette with Ctrl/Cmd + K.</p></div> : null}
    <section className="release-section"><header><div><p className="eyebrow">Keyboard</p><h2>Shortcuts</h2></div></header><div className="shortcut-grid">{keyboardShortcuts.map(([shortcut, description]) => <div key={shortcut}><kbd>{shortcut}</kbd><span>{description}</span></div>)}</div></section>
    <section className="release-actions"><a className="button" href={routeHref({ name: "settings" })}>Open settings</a><a className="button button--secondary" href={routeHref({ name: "maintenance" })}>Troubleshooting & recovery</a><details className="help-advanced-actions"><summary>Technical support tools</summary><div><a className="button button--ghost" href={routeHref({ name: "activity" })}>Download history</a><a className="button button--ghost" href={routeHref({ name: "storage" })}>Local storage</a><a className="button button--ghost" href={routeHref({ name: "diagnostics" })}>Diagnostics</a><a className="button button--ghost" href={routeHref({ name: "validation" })}>Run app self-check</a><a className="button button--ghost" href={routeHref({ name: "release" })}>About capabilities & limitations</a></div></details></section>
  </div>;
}
