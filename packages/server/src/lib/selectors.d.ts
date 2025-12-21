/**
 * Type declarations for Stepwise selector utilities
 */

export interface SelectorOptions {
  strategy?: SelectorStrategy;
  includeTestAttributes?: boolean;
  minConfidence?: number;
  generateMultiple?: boolean;
  maxSelectors?: number;
  traverseIframes?: boolean;
  traverseShadowDOM?: boolean;
}

export interface ElementAttributes {
  id?: string;
  class?: string;
  tagName?: string;
  text?: string;
  title?: string;
  href?: string;
  src?: string;
  alt?: string;
  placeholder?: string;
  name?: string;
  type?: string;
  value?: string;
  role?: string;
  'aria-label'?: string;
  'data-testid'?: string;
  'data-test'?: string;
  'data-cy'?: string;
  [key: `data-${string}`]: string | undefined;
}

export interface SelectorResult {
  selector: string;
  strategy: SelectorStrategy;
  confidence: number;
  metadata?: {
    isUnique: boolean;
    elementCount: number;
    attributes: ElementAttributes;
    xpath?: string;
    path?: SelectorPath;
    type?: string;
  };
}

export interface SelectorPath {
  path: number[];
  tags: string[];
  classes: string[][];
}

export enum SelectorStrategy {
  CSS_SELECTOR = 'css',
  XPATH = 'xpath',
  TEXT = 'text',
  ATTRIBUTE = 'attribute',
  STRUCTURAL = 'structural',
  HYBRID = 'hybrid'
}

export interface SelectorValidationResult {
  isValid: boolean;
  matches: number;
  element?: Element;
  error?: string;
}

export class SelectorCache {
  get(key: string): SelectorResult[] | undefined;
  set(key: string, value: SelectorResult[]): void;
  clear(): void;
  size(): number;
}

export const selectorCache: SelectorCache;

export function generateSelectors(element: Element, options?: SelectorOptions): SelectorResult[];
export function extractElementAttributes(element: Element): ElementAttributes;
export function validateSelector(selector: string, document: Document): SelectorValidationResult;
export function isSelectorUnique(selector: string, document: Document): boolean;
export function findBestSelector(element: Element, candidates: string[], document: Document): SelectorResult | null;
export function handleIframeTraversal(element: Element, options?: SelectorOptions): string | null;
export function handleShadowDOMTraversal(element: Element, options?: SelectorOptions): string | null;
export function generateCompositeSelector(element: Element, options?: SelectorOptions): SelectorResult;
export function optimizeSelector(selector: string, document: Document): string;
export function generateMultipleSelectorOptions(element: Element, maxOptions?: number, document: Document): SelectorResult[];
export function serializeSelectorResult(result: SelectorResult): string;
export function deserializeSelectorResult(data: string): SelectorResult;
export function batchGenerateSelectors(elements: Element[], options?: SelectorOptions): Map<Element, SelectorResult[]>;