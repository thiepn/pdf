import type { NativePageObject, NativePageTree, NativeRect, NativeTextObject } from "../types/nativeEditor";

export interface NativeReflowShift {
  objectId: string;
  sourceBounds: NativeRect;
  bounds: NativeRect;
}

export interface NativeTextReflowPlan {
  ok: boolean;
  primaryBounds: NativeRect;
  deltaY: number;
  shifts: NativeReflowShift[];
  blockers: string[];
}

function right(rect: NativeRect): number { return rect.x + rect.w; }
function bottom(rect: NativeRect): number { return rect.y + rect.h; }

function horizontalOverlap(a: NativeRect, b: NativeRect): number {
  return Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x));
}

function verticalOverlap(a: NativeRect, b: NativeRect): number {
  return Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));
}

function overlapRatio(a: NativeRect, b: NativeRect): number {
  const area = horizontalOverlap(a, b) * verticalOverlap(a, b);
  return area / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

function sameColumn(a: NativeRect, b: NativeRect): boolean {
  const xOverlap = horizontalOverlap(a, b) / Math.max(1, Math.min(a.w, b.w));
  const leftDelta = Math.abs(a.x - b.x);
  return xOverlap >= 0.7 && leftDelta <= Math.max(28, Math.min(a.w, b.w) * 0.22);
}

function union(a: NativeRect, b: NativeRect): NativeRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x1 = Math.max(right(a), right(b));
  const y1 = Math.max(bottom(a), bottom(b));
  return { x, y, w: x1 - x, h: y1 - y };
}

function swept(a: NativeRect, b: NativeRect): NativeRect { return union(a, b); }

function safeFlowText(object: NativePageObject, page: NativePageTree, tableBounds: NativeRect[]): object is NativeTextObject {
  if (object.type !== "text") return false;
  if (object.capability.level !== "safe-reconstruction") return false;
  if (object.writingMode !== 0 || object.direction === "rtl" || object.direction === "unknown") return false;
  if (object.bounds.w <= 2 || object.bounds.h <= 2) return false;
  if (object.bounds.w > page.width * 0.78) return false;
  if (tableBounds.some((bounds) => overlapRatio(object.bounds, bounds) >= 0.25)) return false;
  return true;
}

/**
 * Adds conservative same-column flow metadata to text paragraphs. Wide headings,
 * table text, vertical/RTL text, and unsafe reconstruction objects are intentionally
 * left outside automatic layout propagation.
 */
export function annotatePageTextFlows(page: NativePageTree): NativePageTree {
  const tableBounds = page.objects.filter((object) => object.type === "table").map((object) => object.bounds);
  const candidates = page.objects.filter((object) => safeFlowText(object, page, tableBounds));
  if (!candidates.length) return page;

  const clusters: Array<{ bounds: NativeRect; items: NativeTextObject[] }> = [];
  for (const object of [...candidates].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)) {
    let best: { cluster: typeof clusters[number]; score: number } | undefined;
    for (const cluster of clusters) {
      if (!sameColumn(cluster.bounds, object.bounds)) continue;
      const score = horizontalOverlap(cluster.bounds, object.bounds) / Math.max(1, Math.min(cluster.bounds.w, object.bounds.w));
      if (!best || score > best.score) best = { cluster, score };
    }
    if (best) {
      best.cluster.items.push(object);
      best.cluster.bounds = union(best.cluster.bounds, object.bounds);
    } else clusters.push({ bounds: { ...object.bounds }, items: [object] });
  }

  const flowById = new Map<string, NativeTextObject["flow"]>();
  clusters
    .filter((cluster) => cluster.items.length >= 2)
    .sort((a, b) => a.bounds.x - b.bounds.x)
    .forEach((cluster, flowIndex) => {
      const ordered = [...cluster.items].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
      const flowId = `p${page.pageNumber}:flow:${flowIndex}`;
      ordered.forEach((object, index) => {
        const previous = ordered[index - 1];
        const next = ordered[index + 1];
        flowById.set(object.id, {
          id: flowId,
          index,
          bounds: cluster.bounds,
          gapBefore: previous ? Math.max(0, object.bounds.y - bottom(previous.bounds)) : undefined,
          gapAfter: next ? Math.max(0, next.bounds.y - bottom(object.bounds)) : undefined
        });
      });
    });

  if (!flowById.size) return page;
  return {
    ...page,
    objects: page.objects.map((object) => object.type === "text" && flowById.has(object.id)
      ? { ...object, flow: flowById.get(object.id) }
      : object)
  };
}

function movableText(object: NativePageObject): object is NativeTextObject {
  return object.type === "text" && object.capability.level === "safe-reconstruction" && object.writingMode === 0 && object.direction !== "rtl" && object.direction !== "unknown";
}

function fixedObjectBlocks(object: NativePageObject, page: NativePageTree, rect: NativeRect): boolean {
  if (object.type === "vector") {
    const pageArea = Math.max(1, page.width * page.height);
    const vectorArea = object.bounds.w * object.bounds.h;
    if (vectorArea > pageArea * 0.4 || object.bounds.w < 2 || object.bounds.h < 2) return false;
    return overlapRatio(object.bounds, rect) >= 0.12;
  }
  return overlapRatio(object.bounds, rect) >= 0.08;
}

function blockerLabel(object: NativePageObject): string {
  if (object.type === "text") return `text block “${object.text.slice(0, 28)}${object.text.length > 28 ? "…" : ""}”`;
  if (object.type === "table") return "detected table";
  if (object.type === "form") return `form field “${object.label || object.name || object.fieldType}”`;
  if (object.type === "image") return "image";
  return "vector artwork";
}

/**
 * Plan a push-down or pull-up operation without mutating the page. The selected
 * paragraph keeps its top edge; only later text in the same conservative column
 * flow moves. Any unrelated object encountered by the destination/swept geometry
 * blocks the plan instead of being silently moved.
 */
export function planTextReflow(page: NativePageTree, objectId: string, requestedHeight: number): NativeTextReflowPlan {
  const selected = page.objects.find((object): object is NativeTextObject => object.type === "text" && object.id === objectId);
  const targetHeight = Math.max(1, requestedHeight);
  const fallbackBounds = selected ? { ...selected.bounds, h: targetHeight } : { x: 0, y: 0, w: 0, h: targetHeight };
  if (!selected) return { ok: false, primaryBounds: fallbackBounds, deltaY: 0, shifts: [], blockers: ["The selected text block is no longer present in the page inspection."] };
  if (!movableText(selected) || !selected.flow) return { ok: false, primaryBounds: fallbackBounds, deltaY: targetHeight - selected.bounds.h, shifts: [], blockers: ["This text is not part of a safe same-column flow. Use fixed-box editing instead."] };

  const flow = page.objects
    .filter((object): object is NativeTextObject => movableText(object) && object.flow?.id === selected.flow?.id)
    .sort((a, b) => (a.flow?.index ?? 0) - (b.flow?.index ?? 0));
  const selectedIndex = flow.findIndex((object) => object.id === selected.id);
  if (selectedIndex < 0) return { ok: false, primaryBounds: fallbackBounds, deltaY: 0, shifts: [], blockers: ["The paragraph flow changed during inspection."] };

  const deltaY = targetHeight - selected.bounds.h;
  const primaryBounds = { ...selected.bounds, h: targetHeight };
  const followers = flow.slice(selectedIndex + 1);
  const shifts = followers.map((object) => ({
    objectId: object.id,
    sourceBounds: object.bounds,
    bounds: { ...object.bounds, y: object.bounds.y + deltaY }
  }));
  const blockers: string[] = [];
  const pageTop = page.originY + 2;
  const pageBottom = page.originY + page.height - 2;
  const destinations = [{ objectId: selected.id, sourceBounds: selected.bounds, bounds: primaryBounds }, ...shifts];

  for (const destination of destinations) {
    if (destination.bounds.y < pageTop || bottom(destination.bounds) > pageBottom) {
      blockers.push("The reflow would move text outside the page boundary.");
      break;
    }
  }

  const movingIds = new Set(destinations.map((item) => item.objectId));
  for (const destination of destinations) {
    const movementArea = swept(destination.sourceBounds, destination.bounds);
    for (const object of page.objects) {
      if (movingIds.has(object.id)) continue;
      if (!fixedObjectBlocks(object, page, movementArea)) continue;
      blockers.push(`Reflow is blocked by ${blockerLabel(object)}.`);
    }
  }

  return {
    ok: blockers.length === 0,
    primaryBounds,
    deltaY,
    shifts,
    blockers: [...new Set(blockers)]
  };
}
