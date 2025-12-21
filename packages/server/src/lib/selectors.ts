import type { StepHighlight } from '@stepwise/shared';

interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  role?: string;
  text?: string;
  name?: string;
  placeholder?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

function isDynamicId(id: string): boolean {
  const dynamicPatterns = [
    /^[a-f0-9]{8,}$/i,
    /^[a-z0-9]{10,}$/i,
    /^\d+$/,
    /^:r\d+:$/,
    /^ember\d+$/i,
    /^ng-\d+$/,
    /_\d{5,}$/,
  ];
  
  return dynamicPatterns.some(pattern => pattern.test(id));
}

function isDynamicClass(className: string): boolean {
  const dynamicPatterns = [
    /^[a-z]{1,3}_[a-z0-9]{5,}$/i,
    /^css-[a-z0-9]+$/i,
    /^sc-[a-z]+$/i,
    /^jsx-\d+$/,
  ];
  
  return dynamicPatterns.some(pattern => pattern.test(className));
}

function escapeSelector(str: string): string {
  return str.replace(/["\\]/g, '\\$&');
}

export function generateSelector(info: ElementInfo): string | null {
  if (info.testId) {
    return `[data-testid="${escapeSelector(info.testId)}"]`;
  }
  
  if (info.id && !isDynamicId(info.id)) {
    return `#${escapeSelector(info.id)}`;
  }
  
  if (info.ariaLabel && info.role) {
    return `[role="${info.role}"][aria-label="${escapeSelector(info.ariaLabel)}"]`;
  }
  
  if (info.ariaLabel) {
    return `[aria-label="${escapeSelector(info.ariaLabel)}"]`;
  }
  
  if (info.name && ['input', 'select', 'textarea', 'button'].includes(info.tagName.toLowerCase())) {
    return `${info.tagName.toLowerCase()}[name="${escapeSelector(info.name)}"]`;
  }
  
  if (info.className) {
    const classes = info.className.split(/\s+/).filter(c => !isDynamicClass(c));
    if (classes.length > 0) {
      const selector = `${info.tagName.toLowerCase()}.${classes.slice(0, 2).join('.')}`;
      return selector;
    }
  }
  
  return null;
}

export function truncateText(text: string | null | undefined, maxLength: number = 50): string | null {
  if (!text) return null;
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + '...';
}

export function createHighlight(info: ElementInfo): StepHighlight {
  return {
    selector: generateSelector(info),
    boundingBox: info.boundingBox,
    elementTag: info.tagName.toLowerCase(),
    elementText: truncateText(info.text),
  };
}

export function inferFieldName(info: ElementInfo): string {
  const candidates = [
    info.ariaLabel,
    info.placeholder,
    info.name,
    info.testId,
  ].filter(Boolean) as string[];
  
  if (candidates.length > 0) {
    return candidates[0]!;
  }
  
  switch (info.tagName.toLowerCase()) {
    case 'input':
      return 'Input field';
    case 'textarea':
      return 'Text area';
    case 'select':
      return 'Dropdown';
    default:
      return 'Field';
  }
}
