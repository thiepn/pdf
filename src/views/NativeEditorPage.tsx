import { useEffect } from "react";
import { navigateTo, routeHref } from "../core/appRouter";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }

/**
 * Phase 17 compatibility route. Existing bookmarks/checkpoints can still reference
 * `mode=native`, but all content editing now lives in the unified Editor.
 */
export function NativeEditorPage({ projectId, onTitleChange }: Props) {
  useEffect(() => {
    onTitleChange?.("Edit", "Existing PDF content editing moved into the unified editor");
    const frame = requestAnimationFrame(() => navigateTo({ name: "workspace", projectId, mode: "editor" }));
    return () => cancelAnimationFrame(frame);
  }, [onTitleChange, projectId]);

  const href = routeHref({ name: "workspace", projectId, mode: "editor" });
  return <div className="professional-page native-editor-redirect">
    <section className="professional-panel result-card">
      <p className="eyebrow">Compatibility link</p>
      <h2>Native editing is now part of Edit</h2>
      <p>Text, images, vectors, detected tables, forms, annotations, and added editor objects now share one canvas and one export pipeline.</p>
      <a className="button" href={href}>Open unified editor</a>
    </section>
  </div>;
}
