import { useCallback, useRef } from 'react';

import { DEFAULTS } from '@stepwise/shared';

import { api } from '@/lib/api';
import { translateClientToBrowser } from '@/lib/coords';
import { wsClient } from '@/lib/ws';
import { useSessionStore } from '@/stores/sessionStore';

const BROWSER_DIMENSIONS = {
  width: DEFAULTS.BROWSER_VIEWPORT_WIDTH,
  height: DEFAULTS.BROWSER_VIEWPORT_HEIGHT,
};

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Viewport() {
  const containerRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const currentFrame = useSessionStore((s) => s.currentFrame);
  const isConnected = useSessionStore((s) => s.isConnected);
  const sessionId = useSessionStore((s) => s.sessionId);
  const setError = useSessionStore((s) => s.setError);
  const hoveredElement = useSessionStore((s) => s.hoveredElement);
  const stepHighlightColor = useSessionStore((s) => s.stepHighlightColor);

  const getViewportRect = useCallback((): DOMRect | null => {
    return imageRef.current?.getBoundingClientRect() ?? null;
  }, []);

  const translateCoords = useCallback((clientX: number, clientY: number) => {
    const rect = getViewportRect();
    if (!rect) return null;
    return translateClientToBrowser(clientX, clientY, rect, BROWSER_DIMENSIONS);
  }, [getViewportRect]);

  const isFileUploadTarget = useCallback(() => {
    return hoveredElement?.fileUploadTarget === true;
  }, [hoveredElement]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      wsClient.sendMouseMove(coords.x, coords.y);
    }
  }, [translateCoords]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    containerRef.current?.focus();
    const coords = translateCoords(e.clientX, e.clientY);
    if (isFileUploadTarget()) {
      e.preventDefault();
      e.stopPropagation();
      if (coords) {
        pendingUploadCoordsRef.current = coords;
        uploadInputRef.current?.click();
      }
      return;
    }
    if (coords) {
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      wsClient.sendMouseDown(coords.x, coords.y, button);
    }
  }, [isFileUploadTarget, translateCoords]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isFileUploadTarget()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      wsClient.sendMouseUp(coords.x, coords.y, button);
    }
  }, [isFileUploadTarget, translateCoords]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isFileUploadTarget()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      wsClient.sendMouseClick(coords.x, coords.y, button);
    }
  }, [isFileUploadTarget, translateCoords]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const coords = translateCoords(e.clientX, e.clientY);
    if (coords) {
      wsClient.sendMouseClick(coords.x, coords.y, 'right');
    }
  }, [translateCoords]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

  const handleUploadFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    const coords = pendingUploadCoordsRef.current;

    pendingUploadCoordsRef.current = null;

    if (!selectedFile || !coords || !sessionId) {
      e.target.value = '';
      return;
    }

    try {
      await api.uploadSiteFile(sessionId, selectedFile, coords.x, coords.y);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      e.target.value = '';
    }
  }, [sessionId, setError]);

  if (!isConnected || !currentFrame) {
    return (
      <div className="flex-1 flex flex-col p-8 overflow-hidden">
        <div className="flex flex-col flex-1 bg-white rounded-[48px] shadow-[0_40px_80px_rgba(45,36,30,0.1)] border border-white overflow-hidden relative">
          {/* Connecting State */}
          <div className="flex-1 flex items-center justify-center bg-[#FFF9F5]">
            <div className="text-center text-[#6B5E55]">
              <div className="animate-pulse mb-4 font-bold uppercase tracking-widest">Connecting to browser...</div>
              <div className="text-sm">Please wait while the session starts</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const highlightStyle: React.CSSProperties | null = hoveredElement
    ? {
        position: 'absolute',
        left: `${(hoveredElement.boundingBox.x / BROWSER_DIMENSIONS.width) * 100}%`,
        top: `${(hoveredElement.boundingBox.y / BROWSER_DIMENSIONS.height) * 100}%`,
        width: `${(hoveredElement.boundingBox.width / BROWSER_DIMENSIONS.width) * 100}%`,
        height: `${(hoveredElement.boundingBox.height / BROWSER_DIMENSIONS.height) * 100}%`,
        border: `2px solid ${hexToRgba(stepHighlightColor, 0.8)}`,
        pointerEvents: 'none',
        zIndex: 10,
        borderRadius: '4px',
      }
    : null;

  return (
    <div className="flex-1 flex flex-col p-8 overflow-hidden">
      <div className="flex flex-col flex-1 bg-white rounded-[48px] shadow-[0_40px_80px_rgba(45,36,30,0.1)] border border-white overflow-hidden relative">
        {/* Viewport Surface */}
        <section
          ref={containerRef}
          className="flex-1 bg-[#FFF9F5] relative overflow-hidden cursor-crosshair group"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          aria-label="Browser Viewport"
        >
          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            onChange={(e) => { void handleUploadFileSelected(e); }}
            tabIndex={-1}
            aria-hidden
          />
          <div className="h-full flex items-center justify-center p-8">
            <div className="relative">
              <img
                ref={imageRef}
                src={currentFrame}
                alt="Browser viewport"
                className="max-w-full max-h-full object-contain shadow-lg rounded-lg cursor-default select-none"
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
          </div>

        </section>
      </div>
    </div>
  );
}
