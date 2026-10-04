import type { PagePlanItem } from "../types/organizer";

export function createPagePlan(pageCount: number): PagePlanItem[] {
  return Array.from({ length: pageCount }, (_, sourcePageIndex) => ({
    id: crypto.randomUUID?.() ?? `${sourcePageIndex}-${Date.now()}-${Math.random()}`,
    sourcePageIndex,
    rotation: 0,
    selected: false
  }));
}

export function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const normalized = ((value % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

export function rotateItems(items: PagePlanItem[], ids: Set<string>, delta: number): PagePlanItem[] {
  return items.map((item) => ids.has(item.id)
    ? { ...item, rotation: normalizeRotation(item.rotation + delta) }
    : item);
}

export function duplicateItems(items: PagePlanItem[], ids: Set<string>): PagePlanItem[] {
  const next: PagePlanItem[] = [];
  for (const item of items) {
    next.push(item);
    if (ids.has(item.id)) {
      next.push({
        ...item,
        id: crypto.randomUUID?.() ?? `${item.id}-copy-${Date.now()}-${Math.random()}`,
        selected: true
      });
    }
  }
  return next;
}

export function deleteItems(items: PagePlanItem[], ids: Set<string>): PagePlanItem[] {
  const next = items.filter((item) => !ids.has(item.id));
  return next.length ? next : items;
}

export function moveItems(items: PagePlanItem[], ids: Set<string>, targetIndex: number): PagePlanItem[] {
  const moving = items.filter((item) => ids.has(item.id));
  if (!moving.length) return items;
  const remaining = items.filter((item) => !ids.has(item.id));
  const beforeTarget = items.slice(0, targetIndex).filter((item) => !ids.has(item.id)).length;
  const insertAt = Math.max(0, Math.min(remaining.length, beforeTarget));
  return [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
}

export function moveItemsBy(items: PagePlanItem[], ids: Set<string>, direction: -1 | 1): PagePlanItem[] {
  if (!ids.size) return items;
  const next = [...items];
  let changed = false;
  if (direction < 0) {
    for (let index = 1; index < next.length; index += 1) {
      if (!ids.has(next[index].id) || ids.has(next[index - 1].id)) continue;
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      changed = true;
    }
  } else {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (!ids.has(next[index].id) || ids.has(next[index + 1].id)) continue;
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      changed = true;
    }
  }
  return changed ? next : items;
}

export function moveItemsToPosition(items: PagePlanItem[], ids: Set<string>, position: number): PagePlanItem[] {
  const moving = items.filter((item) => ids.has(item.id));
  if (!moving.length || !Number.isInteger(position)) return items;
  const remaining = items.filter((item) => !ids.has(item.id));
  const insertAt = Math.max(0, Math.min(remaining.length, position - 1));
  const next = [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
  return next.every((item, index) => item.id === items[index]?.id) ? items : next;
}

export function reverseItems(items: PagePlanItem[], selectedOnly = false): PagePlanItem[] {
  if (!selectedOnly) return [...items].reverse();
  const selected = items.filter((item) => item.selected).reverse();
  let pointer = 0;
  return items.map((item) => item.selected ? selected[pointer++] : item);
}

export function selectItems(items: PagePlanItem[], indexes: Set<number>): PagePlanItem[] {
  return items.map((item, index) => ({ ...item, selected: indexes.has(index + 1) }));
}
