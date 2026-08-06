import { useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from 'react';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function DiagramViewport({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ pointerId: -1, x: 0, y: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  function resetView() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function fitView() {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const visual = content?.querySelector<SVGGraphicsElement | HTMLImageElement>('svg, img');
    if (!viewport || !visual) {
      resetView();
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const visualRect = visual.getBoundingClientRect();
    const naturalWidth = visual instanceof HTMLImageElement && visual.naturalWidth
      ? visual.naturalWidth
      : visualRect.width / zoom;
    const naturalHeight = visual instanceof HTMLImageElement && visual.naturalHeight
      ? visual.naturalHeight
      : visualRect.height / zoom;
    if (!naturalWidth || !naturalHeight) return;

    const availableWidth = Math.max(1, viewportRect.width - 72);
    const availableHeight = Math.max(1, viewportRect.height - 88);
    setZoom(clampZoom(Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight)));
    setOffset({ x: 0, y: 0 });
  }

  async function toggleFullscreen() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    try {
      if (document.fullscreenElement === viewport) await document.exitFullscreen();
      else await viewport.requestFullscreen();
    } catch {
      // Fullscreen can be denied by browser or embedding policy; the canvas remains usable.
    }
  }

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === viewportRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  function setZoomAroundPoint(nextZoom: number, clientX?: number, clientY?: number) {
    const clampedZoom = clampZoom(nextZoom);
    if (clampedZoom === zoom) return;

    const viewport = viewportRef.current;
    if (viewport && clientX !== undefined && clientY !== undefined) {
      const rect = viewport.getBoundingClientRect();
      const pointX = clientX - rect.left - rect.width / 2;
      const pointY = clientY - rect.top - rect.height / 2;
      const ratio = clampedZoom / zoom;
      setOffset((current) => ({
        x: pointX - (pointX - current.x) * ratio,
        y: pointY - (pointY - current.y) * ratio,
      }));
    }

    setZoom(clampedZoom);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      setZoomAroundPoint(zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
      return;
    }

    setOffset((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };

    const points = [...pointersRef.current.values()];
    if (points.length === 2) {
      pinchRef.current = {
        distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
        zoom,
      };
      setDragging(false);
    } else {
      setDragging(true);
    }
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const points = [...pointersRef.current.values()];
    if (points.length >= 2 && pinchRef.current) {
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      setZoomAroundPoint(
        pinchRef.current.zoom * (distance / pinchRef.current.distance),
        (points[0].x + points[1].x) / 2,
        (points[0].y + points[1].y) / 2,
      );
      return;
    }

    if (dragRef.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setOffset((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
  }

  function stopPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;

    const remainingPointer = pointersRef.current.entries().next().value as
      | [number, { x: number; y: number }]
      | undefined;
    if (remainingPointer) {
      const [pointerId, point] = remainingPointer;
      dragRef.current = { pointerId, x: point.x, y: point.y };
      setDragging(true);
    } else {
      dragRef.current.pointerId = -1;
      setDragging(false);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const panDistance = event.shiftKey ? 80 : 30;
    if (event.key === '+' || event.key === '=') setZoomAroundPoint(zoom + ZOOM_STEP);
    else if (event.key === '-') setZoomAroundPoint(zoom - ZOOM_STEP);
    else if (event.key === '0') resetView();
    else if (event.key.toLowerCase() === 'f') fitView();
    else if (event.key === 'ArrowLeft') setOffset((current) => ({ ...current, x: current.x + panDistance }));
    else if (event.key === 'ArrowRight') setOffset((current) => ({ ...current, x: current.x - panDistance }));
    else if (event.key === 'ArrowUp') setOffset((current) => ({ ...current, y: current.y + panDistance }));
    else if (event.key === 'ArrowDown') setOffset((current) => ({ ...current, y: current.y - panDistance }));
    else return;
    event.preventDefault();
  }

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      ref={viewportRef}
      className={`diagram-viewport ${dragging ? 'is-dragging' : ''}`}
      role="region"
      aria-label="Interactive diagram preview"
      tabIndex={0}
      onWheel={handleWheel}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={stopPan}
      onPointerCancel={stopPan}
      onDoubleClick={resetView}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={contentRef}
        className="diagram-viewport-content"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
      >
        {children}
      </div>

      <div
        className="diagram-zoom-controls"
        aria-label="Diagram zoom controls"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out (-)"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => setZoomAroundPoint(zoom - ZOOM_STEP)}
        >
          −
        </button>
        <button
          className="diagram-zoom-value"
          type="button"
          aria-label={`Reset diagram view. Current zoom ${zoomPercent}%`}
          title="Reset view (0)"
          onClick={resetView}
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in (+)"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => setZoomAroundPoint(zoom + ZOOM_STEP)}
        >
          +
        </button>
        <span className="diagram-zoom-divider" aria-hidden="true" />
        <button
          className="diagram-zoom-action"
          type="button"
          aria-label="Fit diagram to viewport"
          title="Fit to viewport (F)"
          onClick={fitView}
        >
          Fit
        </button>
        <button
          className="diagram-zoom-action"
          type="button"
          aria-label={isFullscreen ? 'Exit fullscreen preview' : 'Open fullscreen preview'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={() => void toggleFullscreen()}
        >
          {isFullscreen ? 'Exit' : 'Full'}
        </button>
      </div>

      <span className="diagram-viewport-hint">Drag to move · Wheel to pan · Pinch or Ctrl/⌘ + wheel to zoom</span>
    </div>
  );
}
