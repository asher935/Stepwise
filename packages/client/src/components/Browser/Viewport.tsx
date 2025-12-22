/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useCallback, useRef } from 'react';

import { DEFAULTS } from '@stepwise/shared';
import type { ElementInfo } from '@stepwise/shared';

import { translateClientToBrowser } from '@/lib/coords';
import { wsClient } from '@/lib/ws';
import { useSessionStore } from '@/stores/sessionStore';

const BROWSER_DIMENSIONS = {
  width: DEFAULTS.BROWSER_VIEWPORT_WIDTH,
  height: DEFAULTS.BROWSER_VIEWPORT_HEIGHT,
};

export function Viewport() {
  const containerRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const currentFrame = useSessionStore((s) => s.currentFrame);
  const isConnected = useSessionStore((s) => s.isConnected);
  const hoveredElement = useSessionStore((s) => s.hoveredElement);

  const getViewportRect = useCallback((): DOMRect | null => {
    return imageRef.current?.getBoundingClientRect() ?? null;
  }, []);

  const translateCoords = useCallback((clientX: number, clientY: number) => {
    const rect = getViewportRect();
    if (!rect) return null;
    return translateClientToBrowser(clientX, clientY, rect, BROWSER_DIMENSIONS);
  }, [getViewportRect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      wsClient.sendMouseMove(coords.x, coords.y);
    }
  }, [translateCoords]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    containerRef.current?.focus();
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      wsClient.sendMouseDown(coords.x, coords.y, button);
    }
  }, [translateCoords]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      wsClient.sendMouseUp(coords.x, coords.y, button);
    }
  }, [translateCoords]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      wsClient.sendMouseClick(coords.x, coords.y, button);
    }
  }, [translateCoords]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      wsClient.sendMouseClick(coords.x, coords.y, 'right');
    }
  }, [translateCoords]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      wsClient.sendScroll(coords.x, coords.y, e.deltaX, e.deltaY);
    }
  }, [translateCoords]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    wsClient.sendKeyDown(
      e.key,
      e.key.length === 1 ? e.key : undefined,
      {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      },
      e.code,
      e.keyCode
    );
  }, []);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    wsClient.sendKeyUp(
      e.key,
      {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      },
      e.code,
      e.keyCode
    );
  }, []);

  // Calculate highlight overlay position based on viewport scale
  const getHighlightStyle = useCallback((): React.CSSProperties | null => {
    if (!hoveredElement || !imageRef.current) return null;

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = rect.width / BROWSER_DIMENSIONS.width;
    const scaleY = rect.height / BROWSER_DIMENSIONS.height;

    return {
      position: 'absolute',
      left: `${hoveredElement.boundingBox.x * scaleX}px`,
      top: `${hoveredElement.boundingBox.y * scaleY}px`,
      width: `${hoveredElement.boundingBox.width * scaleX}px`,
      height: `${hoveredElement.boundingBox.height * scaleY}px`,
      border: '2px solid rgba(59, 130, 246, 0.8)',
      pointerEvents: 'none',
      zIndex: 10,
    };
  }, [hoveredElement]);

  if (!isConnected || !currentFrame) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/50">
        <div className="text-center text-muted-foreground">
          <div className="animate-pulse mb-2">Connecting to browser...</div>
          <div className="text-sm">Please wait while the session starts</div>
        </div>
      </div>
    );
  }

  const highlightStyle = getHighlightStyle();

  return (
    <section
      ref={containerRef}
      className="flex-1 flex items-center justify-center bg-muted/30 overflow-hidden p-4"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      aria-label="Browser Viewport"
    >
      <div className="relative">
        <img
          ref={imageRef}
          src={currentFrame}
          alt="Browser viewport"
          className="max-w-full max-h-full object-contain shadow-lg rounded-sm cursor-default select-none"
          style={{ aspectRatio: `${BROWSER_DIMENSIONS.width}/${BROWSER_DIMENSIONS.height}` }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onWheel={handleWheel}
          draggable={false}
        />
        {highlightStyle && <div style={highlightStyle} />}
      </div>
    </section>
  );
}
