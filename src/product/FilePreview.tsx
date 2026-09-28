import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { openPdfWithPdfJs } from "../engines/pdfjsBase";
import type { QuickInput } from "../quick/quickOperations";

/** A bounded cover preview. Callers limit these to six files, never every page. */
export function FilePreview({ input, pageNumber = 1 }: { input: QuickInput; pageNumber?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>();
  useEffect(() => {
    let disposed = false;
    let destroy: (() => void) | undefined;
    setReady(false);
    if (input.image) {
      const url = URL.createObjectURL(input.image); setImageUrl(url);
      return () => { URL.revokeObjectURL(url); };
    }
    setImageUrl(undefined);
    void (async () => {
      try {
        const pdf = await openPdfWithPdfJs(input.bytes, input.password);
        destroy = () => { void pdf.loadingTask.destroy(); };
        if (disposed) { destroy(); return; }
        try {
          const page = await pdf.getPage(pageNumber);
          try {
            const canvas = canvasRef.current; if (!canvas || disposed) return;
            const original = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(240 / original.width, 310 / original.height) });
            canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
            const context = canvas.getContext("2d", { alpha: false }); if (!context) return;
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            if (!disposed) setReady(true);
          } finally { page.cleanup(); }
        } finally { destroy(); destroy = undefined; }
      } catch { /* A cover preview failure must never prevent processing the PDF. */ }
    })();
    return () => { disposed = true; destroy?.(); };
  }, [input.id, input.bytes, input.password, input.image, pageNumber]);
  return <span className="file-preview" aria-hidden="true">{imageUrl ? <img alt="" src={imageUrl} /> : <><canvas ref={canvasRef} style={{ display: ready ? "block" : "none" }} />{!ready ? <Icon name="documents" size={38} /> : null}</>}</span>;
}
