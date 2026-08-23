import { useEffect, useRef } from "react";

type Handlers = {
  onPlay?: () => void;
  onRec?: () => void;
  onRate?: (n: number) => void;
  onNext?: () => void;
  canNext?: boolean;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "TEXTAREA" ||
    tag === "INPUT" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function usePracticeKeys(handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const h = ref.current;
      const typing = isTypingTarget(e.target);

      if (e.key === "Enter" && !e.shiftKey && h.onNext && h.canNext !== false) {
        if (typing) return;
        e.preventDefault();
        h.onNext();
        return;
      }
      if (typing) return;
      if (e.code === "Space" && h.onPlay) {
        e.preventDefault();
        h.onPlay();
      } else if (h.onRate && ["1", "2", "3", "4", "5"].includes(e.key)) {
        e.preventDefault();
        h.onRate(Number(e.key));
      } else if (h.onRec && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        h.onRec();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
