import * as mupdf from "mupdf";

interface ValidateRequest {
  type: "VALIDATE_FONT";
  requestId: string;
  bytes: ArrayBuffer;
  fontName: string;
  text: string;
}

interface CancelRequest {
  type: "CANCEL";
  requestId: string;
}

type Request = ValidateRequest | CancelRequest;

const cancelled = new Set<string>();

function active(requestId: string): void {
  if (cancelled.has(requestId)) throw new DOMException("Font validation cancelled.", "AbortError");
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }

  void (async () => {
    let font: any;
    try {
      active(request.requestId);
      const bytes = new Uint8Array(request.bytes);
      if (!bytes.byteLength) throw new Error("The selected font file is empty.");
      font = new (mupdf as any).Font(request.fontName || "Imported Font", bytes);
      active(request.requestId);

      const missing = new Set<string>();
      for (const character of [...request.text]) {
        if (/\s/u.test(character)) continue;
        const code = character.codePointAt(0) ?? 0;
        const glyph = Number(font.encodeCharacter(code));
        if (!Number.isFinite(glyph) || glyph <= 0) {
          missing.add(character);
        } else {
          const advance = Number(font.advanceGlyph(glyph, 0));
          if (!Number.isFinite(advance) || advance < 0) throw new Error(`The imported font returned invalid glyph metrics for “${character}”.`);
        }
        if (missing.size >= 12) break;
      }

      self.postMessage({
        type: "FONT_VALIDATION_RESULT",
        requestId: request.requestId,
        missingCharacters: [...missing]
      });
    } catch (reason) {
      self.postMessage({
        type: "FONT_VALIDATION_ERROR",
        requestId: request.requestId,
        error: {
          name: reason instanceof Error ? reason.name : "Error",
          message: reason instanceof Error ? reason.message : String(reason)
        }
      });
    } finally {
      cancelled.delete(request.requestId);
      font?.destroy?.();
    }
  })();
};

self.postMessage({ type: "READY" });
