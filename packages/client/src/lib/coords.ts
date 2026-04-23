interface BrowserDimensions {
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
