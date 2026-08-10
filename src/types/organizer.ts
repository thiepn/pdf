export interface PagePlanItem {
  id: string;
  sourcePageIndex: number;
  rotation: 0 | 90 | 180 | 270;
  selected: boolean;
}

export interface PagePlanSnapshot {
  projectId: string;
  items: PagePlanItem[];
  updatedAt: number;
}

export interface PageSelectionContext {
  pageCount: number;
  portrait?: Set<number>;
  landscape?: Set<number>;
}
