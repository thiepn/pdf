import { useEffect, type RefObject } from "react";

const modalStack: HTMLElement[] = [];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    const style = window.getComputedStyle(element);
    return !element.closest("[hidden], [inert]") && element.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden";
  });
}

export function useModalFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
  returnFocusRef?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    if (!container) return;
    const openingLocation = window.location.href;
    modalStack.push(container);

    const focusInitial = () => {
      if (modalStack.at(-1) !== container || !container.isConnected) return;
      const target = initialFocusRef?.current ?? getFocusableElements(container)[0] ?? container;
      if (!container.hasAttribute("tabindex") && target === container) container.tabIndex = -1;
      target.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusInitial);

    const onKeyDown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== container) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(container);
      if (!focusable.length) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!container.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.documentElement.dataset.modalOpen = "true";
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      const index = modalStack.lastIndexOf(container);
      if (index >= 0) modalStack.splice(index, 1);
      if (!modalStack.length) delete document.documentElement.dataset.modalOpen;
      window.requestAnimationFrame(() => {
        if (window.location.href !== openingLocation) return;
        const activeModal = modalStack.at(-1);
        const target = returnFocusRef?.current;
        if (activeModal && !activeModal.contains(target ?? previous)) return;
        // A user may already have followed a skip link or focused another control.
        // Delayed restoration must not undo that newer, intentional focus change.
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected
          && !container.contains(focused) && focused !== target && focused !== previous) return;
        if (target?.isConnected) target.focus({ preventScroll: true });
        else if (previous?.isConnected) previous.focus({ preventScroll: true });
      });
    };
  }, [containerRef, initialFocusRef, onClose, open, returnFocusRef]);
}
