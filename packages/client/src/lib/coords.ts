export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface BrowserDimensions {
  width: number;
  height: number;
}

export function translateClientToBrowser(
  clientX: number,
  clientY: number,
  viewportRect: DOMRect,
  browserDimensions: BrowserDimensions
): { x: number; y: number } {
  const relativeX = clientX - viewportRect.left;
  const relativeY = clientY - viewportRect.top;

  const scaleX = browserDimensions.width / viewportRect.width;
  const scaleY = browserDimensions.height / viewportRect.height;

  return {
    x: Math.round(relativeX * scaleX),
    y: Math.round(relativeY * scaleY),
  };
}

export function translateBrowserToClient(
  browserX: number,
  browserY: number,
  viewportRect: DOMRect,
  browserDimensions: BrowserDimensions
): { x: number; y: number } {
  const scaleX = viewportRect.width / browserDimensions.width;
  const scaleY = viewportRect.height / browserDimensions.height;

  return {
    x: Math.round(browserX * scaleX + viewportRect.left),
    y: Math.round(browserY * scaleY + viewportRect.top),
  };
}

export function getScaleFactor(
  viewportRect: DOMRect,
  browserDimensions: BrowserDimensions
): number {
  return Math.min(
    viewportRect.width / browserDimensions.width,
    viewportRect.height / browserDimensions.height
  );
}
