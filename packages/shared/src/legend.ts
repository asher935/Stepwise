import type { StepLegendItem } from './step.js';

export const EMPTY_LEGEND_CAPTION = 'Review the current view';

export function buildLegendCaption(items: StepLegendItem[]): string {
  if (items.length === 0) {
    return EMPTY_LEGEND_CAPTION;
  }

  const lines = items.map((item) => `(${item.bubbleNumber}) ${item.label.toLowerCase()}`);
  return ['On this page:', ...lines].join('\n');
}
