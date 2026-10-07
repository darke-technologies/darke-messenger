import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

const STORAGE_KEY = "darke-detail-post-h-by-id";
const LEGACY_KEY = "darke-detail-post-h";
const MIN_POST = 88;
const MIN_THREAD = 96;

function readMap(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= MIN_POST) {
        out[id] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}

export function useDetailPostHeight(postId: string | null) {
  const [height, setHeight] = useState<number | null>(() =>
    postId ? (readMap()[postId] ?? null) : null,
  );

  useEffect(() => {
    setHeight(postId ? (readMap()[postId] ?? null) : null);
  }, [postId]);

  const persist = useCallback(
    (n: number) => {
      if (!postId) return;
      const next = Math.round(n);
      setHeight(next);
      const map = readMap();
      map[postId] = next;
      writeMap(map);
    },
    [postId],
  );

  return { height, persist };
}

export function NewsfeedPostResize({
  onHeight,
  onBegin,
}: {
  onHeight: (n: number) => void;
  onBegin?: () => void;
}) {
  const drag = useRef<{
    pointer: number;
    startY: number;
    startH: number;
    max: number;
  } | null>(null);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    onBegin?.();
    const pane = e.currentTarget.closest(".newsfeed-detail");
    const original = e.currentTarget.previousElementSibling;
    if (!(pane instanceof HTMLElement) || !(original instanceof HTMLElement)) {
      return;
    }
    const footer = pane.querySelector(".newsfeed-detail-footer");
    const footerH = footer instanceof HTMLElement ? footer.offsetHeight : 72;
    const max = Math.max(
      MIN_POST,
      pane.clientHeight - footerH - e.currentTarget.offsetHeight - MIN_THREAD,
    );
    drag.current = {
      pointer: e.pointerId,
      startY: e.clientY,
      startH: original.getBoundingClientRect().height,
      max,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add("is-ns-resize");
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    const next = Math.min(
      d.max,
      Math.max(MIN_POST, d.startH + (e.clientY - d.startY)),
    );
    onHeight(next);
  }

  function endDrag(e: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointer !== e.pointerId) return;
    drag.current = null;
    document.body.classList.remove("is-ns-resize");
  }

  return (
    <button
      type="button"
      className="newsfeed-post-resize"
      aria-label="Resize post"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}
