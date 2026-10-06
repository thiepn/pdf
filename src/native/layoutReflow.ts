import type { NativePageObject, NativePageTree, NativeRect, NativeTextObject } from "../types/nativeEditor";

export interface NativeReflowShift {
  objectId: string;
  sourceBounds: NativeRect;
  bounds: NativeRect;
  /** True when P17 moves a paragraph into the next deterministic adjacent region. */
  crossRegion?: boolean;
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

  const clusters: Array<{ bounds: NativeRect; items: NativeTextObject[]; flowId?: string; threadId?: string; regionIndex?: number; regionCount?: number; nextRegionId?: string }> = [];
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

  const regions = clusters
    .filter((cluster) => cluster.items.length >= 2)
    .sort((a, b) => a.bounds.x - b.bounds.x);
  regions.forEach((cluster, flowIndex) => { cluster.flowId = `p${page.pageNumber}:flow:${flowIndex}`; });

  const adjacency = (left: typeof regions[number], rightRegion: typeof regions[number]): boolean => {
    const gap = rightRegion.bounds.x - right(left.bounds);
    if (gap < 8 || gap > page.width * 0.22) return false;
    const widthRatio = left.bounds.w / Math.max(1, rightRegion.bounds.w);
    if (widthRatio < 0.72 || widthRatio > 1.38) return false;
    const yOverlap = verticalOverlap(left.bounds, rightRegion.bounds) / Math.max(1, Math.min(left.bounds.h, rightRegion.bounds.h));
    if (yOverlap < 0.65) return false;
    const topDelta = Math.abs(left.bounds.y - rightRegion.bounds.y);
    return topDelta <= Math.max(36, Math.min(left.bounds.h, rightRegion.bounds.h) * 0.14);
  };

  const adjacentPair = (first: typeof regions[number], second: typeof regions[number]): boolean =>
    first.bounds.x <= second.bounds.x ? adjacency(first, second) : adjacency(second, first);

  let threadIndex = 0;
  for (let index = 0; index < regions.length - 1; index += 1) {
    const leftRegion = regions[index];
    const rightRegion = regions[index + 1];
    if (leftRegion.threadId || rightRegion.threadId || !adjacency(leftRegion, rightRegion)) continue;
    const competingLeft = regions.some((candidate, candidateIndex) =>
      candidateIndex !== index && candidateIndex !== index + 1 && adjacentPair(leftRegion, candidate));
    const competingRight = regions.some((candidate, candidateIndex) =>
      candidateIndex !== index && candidateIndex !== index + 1 && adjacentPair(rightRegion, candidate));
    if (competingLeft || competingRight) continue;
    const threadId = `p${page.pageNumber}:thread:${threadIndex++}`;
    leftRegion.threadId = threadId;
    leftRegion.regionIndex = 0;
    leftRegion.regionCount = 2;
    leftRegion.nextRegionId = rightRegion.flowId;
    rightRegion.threadId = threadId;
    rightRegion.regionIndex = 1;
    rightRegion.regionCount = 2;
  }

  const flowById = new Map<string, NativeTextObject["flow"]>();
  regions.forEach((cluster) => {
    const ordered = [...cluster.items].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
    ordered.forEach((object, index) => {
      const previous = ordered[index - 1];
      const next = ordered[index + 1];
      flowById.set(object.id, {
        id: cluster.flowId!,
        index,
        bounds: cluster.bounds,
        gapBefore: previous ? Math.max(0, object.bounds.y - bottom(previous.bounds)) : undefined,
        gapAfter: next ? Math.max(0, next.bounds.y - bottom(object.bounds)) : undefined,
        threadId: cluster.threadId,
        regionIndex: cluster.regionIndex,
        regionCount: cluster.regionCount,
        nextRegionId: cluster.nextRegionId
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
  if (!movableText(selected) || !selected.flow) return { ok: false, primaryBounds: fallbackBounds, deltaY: targetHeight - selected.bounds.h, shifts: [], blockers: ["This text is not part of a safe detected flow. Use fixed-box editing instead."] };

  const flow = page.objects
    .filter((object): object is NativeTextObject => movableText(object) && object.flow?.id === selected.flow?.id)
    .sort((a, b) => (a.flow?.index ?? 0) - (b.flow?.index ?? 0));
  const selectedIndex = flow.findIndex((object) => object.id === selected.id);
  if (selectedIndex < 0) return { ok: false, primaryBounds: fallbackBounds, deltaY: 0, shifts: [], blockers: ["The paragraph flow changed during inspection."] };

  const deltaY = targetHeight - selected.bounds.h;
  const primaryBounds = { ...selected.bounds, h: targetHeight };
  const followers = flow.slice(selectedIndex + 1);
  let shifts: NativeReflowShift[] = followers.map((object) => ({
    objectId: object.id,
    sourceBounds: object.bounds,
    bounds: { ...object.bounds, y: object.bounds.y + deltaY }
  }));
  const blockers: string[] = [];
  const pageTop = page.originY + 2;
  const pageBottom = page.originY + page.height - 2;

  if (primaryBounds.y < pageTop || bottom(primaryBounds) > pageBottom) {
    blockers.push("The edited paragraph would extend outside the page boundary.");
  }

  const overflow = deltaY > 0 ? shifts.filter((shift) => bottom(shift.bounds) > pageBottom) : [];
  if (overflow.length) {
    const firstOverflow = shifts.findIndex((shift) => overflow.some((item) => item.objectId === shift.objectId));
    const suffixOnly = firstOverflow >= 0 && shifts.slice(firstOverflow).every((shift) => overflow.some((item) => item.objectId === shift.objectId));
    const nextRegionId = selected.flow.nextRegionId;
    const nextRegion = nextRegionId ? page.objects
      .filter((object): object is NativeTextObject => movableText(object) && object.flow?.id === nextRegionId)
      .sort((a, b) => (a.flow?.index ?? 0) - (b.flow?.index ?? 0)) : [];

    if (!suffixOnly || !nextRegion.length || selected.flow.regionIndex !== 0 || selected.flow.regionCount !== 2) {
      blockers.push("The reflow would move text outside the page boundary.");
    } else {
      const nextBounds = nextRegion[0].flow?.bounds;
      const spillObjects = flow.filter((object) => overflow.some((shift) => shift.objectId === object.id));
      if (!nextBounds || spillObjects.some((object) => object.bounds.w > nextBounds.w + 4)) {
        blockers.push("The adjacent text region is too narrow for the overflowing paragraph.");
      } else {
        const normal = shifts.slice(0, firstOverflow);
        const spill: NativeReflowShift[] = [];
        let cursorY = nextBounds.y;
        for (const object of spillObjects) {
          const width = Math.min(object.bounds.w, nextBounds.w);
          const bounds = { ...object.bounds, x: nextBounds.x, y: cursorY, w: width };
          spill.push({ objectId: object.id, sourceBounds: object.bounds, bounds, crossRegion: true });
          cursorY = bottom(bounds) + Math.max(4, object.flow?.gapAfter ?? 6);
        }
        const insertedHeight = Math.max(0, cursorY - nextBounds.y);
        const pushed = nextRegion.map((object) => ({
          objectId: object.id,
          sourceBounds: object.bounds,
          bounds: { ...object.bounds, y: object.bounds.y + insertedHeight }
        }));
        if ([...spill, ...pushed].some((shift) => shift.bounds.y < pageTop || bottom(shift.bounds) > pageBottom)) {
          blockers.push("The adjacent text region does not have enough bounded space for this reflow.");
        } else shifts = [...normal, ...spill, ...pushed];
      }
    }
  } else if (shifts.some((shift) => shift.bounds.y < pageTop || bottom(shift.bounds) > pageBottom)) {
    blockers.push("The reflow would move text outside the page boundary.");
  }

  const destinations = [{ objectId: selected.id, sourceBounds: selected.bounds, bounds: primaryBounds, crossRegion: false }, ...shifts];
  const movingIds = new Set(destinations.map((item) => item.objectId));
  for (const destination of destinations) {
    const movementArea = destination.crossRegion ? destination.bounds : swept(destination.sourceBounds, destination.bounds);
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
