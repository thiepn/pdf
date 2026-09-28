/** Scroll only the PDF viewport. scrollIntoView also scrolls overflow-hidden
 * ancestors, which can move the document header off-screen during hydration. */
export function scrollPageWithinStage(stage: HTMLElement, page: HTMLElement | undefined, behavior: ScrollBehavior = "auto"): void {
  if (!page || !stage.contains(page)) return;
  const top = stage.scrollTop + page.getBoundingClientRect().top - stage.getBoundingClientRect().top - stage.clientTop;
  if (!Number.isFinite(top)) return;
  stage.scrollTo({ top: Math.max(0, Math.min(top, stage.scrollHeight - stage.clientHeight)), behavior });
}
