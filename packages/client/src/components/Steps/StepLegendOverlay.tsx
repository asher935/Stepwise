import type { StepLegendItem } from '@stepwise/shared';

interface StepLegendOverlayProps {
  legendItems: StepLegendItem[];
  imageWidth: number;
  imageHeight: number;
  highlightColor: string;
  hoveredBubbleNumber?: number | null;
  hoverHighlightColor?: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function StepLegendOverlay({
  legendItems,
  imageWidth,
  imageHeight,
  highlightColor,
  hoveredBubbleNumber = null,
  hoverHighlightColor = '#E67E22',
}: StepLegendOverlayProps) {
  if (legendItems.length === 0 || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {legendItems.map((item) => {
        const isHovered = item.bubbleNumber === hoveredBubbleNumber;
        const itemHighlightColor = isHovered ? hoverHighlightColor : highlightColor;
        const left = (item.boundingBox.x / imageWidth) * 100;
        const top = (item.boundingBox.y / imageHeight) * 100;
        const width = (item.boundingBox.width / imageWidth) * 100;
        const height = (item.boundingBox.height / imageHeight) * 100;
        const bubbleLeft = Math.min(97, left + width + 1);
        const bubbleTop = Math.min(97, Math.max(0, top + height / 2 - 2));

        return (
          <div key={`${item.bubbleNumber}:${item.label}`}>
            <div
              className="absolute border-2 rounded-md"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
                borderColor: itemHighlightColor,
                backgroundColor: hexToRgba(itemHighlightColor, 0.1),
              }}
            />
            <div
              className="absolute w-6 h-6 rounded-full text-white text-[11px] font-black flex items-center justify-center border border-white shadow-lg"
              style={{
                left: `${bubbleLeft}%`,
                top: `${bubbleTop}%`,
                backgroundColor: itemHighlightColor,
              }}
            >
              {item.bubbleNumber}
            </div>
          </div>
        );
      })}
    </div>
  );
}
