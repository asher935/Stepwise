/**
 * Selector generation utilities for Stepwise browser recorder
 * Provides robust element identification strategies for recording and replaying user interactions
 */

// Type definitions for selector generation
export interface SelectorOptions {
  /** Preferred selector strategy */
  strategy?: SelectorStrategy;
  /** Include test attributes in selector generation */
  includeTestAttributes?: boolean;
  /** Minimum confidence score for a selector to be considered valid */
  minConfidence?: number;
  /** Generate multiple selector options */
  generateMultiple?: boolean;
  /** Maximum number of selectors to generate */
  maxSelectors?: number;
  /** Handle iframe content */
  traverseIframes?: boolean;
  /** Handle shadow DOM */
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
  /** The generated selector string */
  selector: string;
  /** The strategy used to generate the selector */
  strategy: SelectorStrategy;
  /** Confidence score (0-1) indicating selector stability */
  confidence: number;
  /** Additional metadata about the selector */
  metadata?: {
    isUnique: boolean;
    elementCount: number;
    attributes: ElementAttributes;
    xpath?: string;
  };
}

export interface SelectorPath {
  /** Array of element indices from root */
  path: number[];
  /** Tag names for each element in path */
  tags: string[];
  /** CSS classes for each element in path */
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
  element?: any;
  error?: string;
}

// Configuration for selector generation
const DEFAULT_OPTIONS: Required<Omit<SelectorOptions, 'strategy' | 'maxSelectors'>> = {
  includeTestAttributes: true,
  minConfidence: 0.7,
  generateMultiple: false,
  traverseIframes: true,
  traverseShadowDOM: true
};

// Test attribute patterns commonly used in testing frameworks
const TEST_ATTRIBUTE_PATTERNS = [
  'data-testid',
  'data-test',
  'data-cy',
  'data-qa',
  'data-test-id',
  'test-id',
  'data-testing'
];

// Stability weights for different selector attributes
const STABILITY_WEIGHTS = {
  id: 1.0,
  testAttribute: 0.95,
  name: 0.9,
  ariaLabel: 0.85,
  title: 0.8,
  type: 0.75,
  class: 0.6,
  tag: 0.4,
  text: 0.5,
  href: 0.7,
  src: 0.7,
  structure: 0.3
};

/**
 * Generate optimal selectors for a DOM element
 */
export function generateSelectors(element: any, options: SelectorOptions = {}): SelectorResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!element || !element.tagName) {
    throw new Error('Invalid element provided');
  }

  // Extract element attributes
  const attributes = extractElementAttributes(element);

  // Generate selectors using different strategies
  const selectors: SelectorResult[] = [];

  // Strategy 1: ID-based selector (most stable)
  if (attributes.id) {
    selectors.push(generateIdSelector(attributes));
  }

  // Strategy 2: Test attribute selectors
  if (opts.includeTestAttributes) {
    const testSelectors = generateTestAttributeSelectors(attributes);
    selectors.push(...testSelectors);
  }

  // Strategy 3: Name attribute selector
  if (attributes.name) {
    selectors.push(generateNameSelector(attributes));
  }

  // Strategy 4: ARIA-based selectors
  if (attributes['aria-label']) {
    selectors.push(generateAriaSelector(attributes));
  }

  // Strategy 5: Class-based selector
  if (attributes.class) {
    selectors.push(generateClassSelector(attributes));
  }

  // Strategy 6: Text-based selector
  if (attributes.text) {
    selectors.push(generateTextSelector(attributes));
  }

  // Strategy 7: Structural selector
  selectors.push(generateStructuralSelector(element, attributes));

  // Strategy 8: XPath selector as fallback
  selectors.push(generateXPathSelector(element, attributes));

  // Score and filter selectors
  const scoredSelectors = selectors.map(s => ({
    ...s,
    confidence: calculateSelectorConfidence(s, attributes)
  }));

  // Filter by minimum confidence
  const validSelectors = scoredSelectors.filter(s => s.confidence >= opts.minConfidence);

  // Sort by confidence (highest first)
  validSelectors.sort((a, b) => b.confidence - a.confidence);

  // Return limited number of selectors if requested
  if (opts.generateMultiple && opts.maxSelectors) {
    return validSelectors.slice(0, opts.maxSelectors);
  }

  return validSelectors.length > 0 ? [validSelectors[0]] : validSelectors;
}

/**
 * Extract all relevant attributes from a DOM element
 */
export function extractElementAttributes(element: any): ElementAttributes {
  const attributes: ElementAttributes = {
    tagName: element.tagName?.toLowerCase()
  };

  // Extract standard attributes
  const standardAttrs = ['id', 'class', 'title', 'href', 'src', 'alt', 'placeholder', 'name', 'type', 'value', 'role'];
  standardAttrs.forEach(attr => {
    const value = element.getAttribute?.(attr) || element[attr];
    if (value) {
      attributes[attr as keyof ElementAttributes] = value;
    }
  });

  // Extract ARIA attributes
  const ariaLabel = element.getAttribute?.('aria-label') || element.getAttribute?.('aria-labelledby');
  if (ariaLabel) {
    attributes['aria-label'] = ariaLabel;
  }

  // Extract test attributes
  TEST_ATTRIBUTE_PATTERNS.forEach(pattern => {
    const value = element.getAttribute?.(pattern);
    if (value) {
      attributes[pattern as keyof ElementAttributes] = value;
    }
  });

  // Extract text content (cleaned)
  const textContent = element.textContent?.trim();
  if (textContent && textContent.length < 100) {
    attributes.text = textContent;
  }

  return attributes;
}

/**
 * Generate ID-based CSS selector
 */
function generateIdSelector(attributes: ElementAttributes): SelectorResult {
  const selector = `#${escapeCssValue(attributes.id!)}`;

  return {
    selector,
    strategy: SelectorStrategy.CSS_SELECTOR,
    confidence: STABILITY_WEIGHTS.id,
    metadata: {
      isUnique: true, // IDs should be unique
      elementCount: 1,
      attributes: { id: attributes.id }
    }
  };
}

/**
 * Generate test attribute selectors
 */
function generateTestAttributeSelectors(attributes: ElementAttributes): SelectorResult[] {
  const selectors: SelectorResult[] = [];

  TEST_ATTRIBUTE_PATTERNS.forEach(pattern => {
    const value = attributes[pattern as keyof ElementAttributes];
    if (value) {
      const selector = `[${pattern}="${escapeCssValue(value)}"]`;
      selectors.push({
        selector,
        strategy: SelectorStrategy.ATTRIBUTE,
        confidence: STABILITY_WEIGHTS.testAttribute,
        metadata: {
          isUnique: true,
          elementCount: 1,
          attributes: { [pattern]: value }
        }
      });
    }
  });

  return selectors;
}

/**
 * Generate name-based selector
 */
function generateNameSelector(attributes: ElementAttributes): SelectorResult {
  const selector = `[name="${escapeCssValue(attributes.name!)}"]`;

  return {
    selector,
    strategy: SelectorStrategy.ATTRIBUTE,
    confidence: STABILITY_WEIGHTS.name,
    metadata: {
      isUnique: false,
      elementCount: 0,
      attributes: { name: attributes.name }
    }
  };
}

/**
 * Generate ARIA-based selector
 */
function generateAriaSelector(attributes: ElementAttributes): SelectorResult {
  const selector = `[aria-label="${escapeCssValue(attributes['aria-label']!)}"]`;

  return {
    selector,
    strategy: SelectorStrategy.ATTRIBUTE,
    confidence: STABILITY_WEIGHTS.ariaLabel,
    metadata: {
      isUnique: false,
      elementCount: 0,
      attributes: { 'aria-label': attributes['aria-label'] }
    }
  };
}

/**
 * Generate class-based CSS selector
 */
function generateClassSelector(attributes: ElementAttributes): SelectorResult {
  const classes = attributes.class?.split(/\s+/).filter(Boolean);
  if (!classes || classes.length === 0) {
    throw new Error('No classes found');
  }

  // Use the first class that seems unique or meaningful
  const meaningfulClass = classes.find(cls =>
    !cls.match(/^(active|selected|hidden|visible|disabled|enabled|focus|hover)$/)
  ) || classes[0];

  const selector = `.${escapeCssValue(meaningfulClass)}`;

  return {
    selector,
    strategy: SelectorStrategy.CSS_SELECTOR,
    confidence: STABILITY_WEIGHTS.class,
    metadata: {
      isUnique: false,
      elementCount: 0,
      attributes: { class: meaningfulClass }
    }
  };
}

/**
 * Generate text-based selector
 */
function generateTextSelector(attributes: ElementAttributes): SelectorResult {
  const text = attributes.text!;

  // Prefer exact match for short text, contains for longer text
  const selector = text.length < 20
    ? `${attributes.tagName || '*'}[text="${escapeCssValue(text)}"]`
    : `${attributes.tagName || '*'}[text*="${escapeCssValue(text)}"]`;

  return {
    selector,
    strategy: SelectorStrategy.TEXT,
    confidence: STABILITY_WEIGHTS.text,
    metadata: {
      isUnique: false,
      elementCount: 0,
      attributes: { text }
    }
  };
}

/**
 * Generate structural selector based on DOM position
 */
function generateStructuralSelector(element: any, attributes: ElementAttributes): SelectorResult {
  const path = getElementPath(element);
  const selector = pathToCssSelector(path, attributes);

  return {
    selector,
    strategy: SelectorStrategy.STRUCTURAL,
    confidence: STABILITY_WEIGHTS.structure,
    metadata: {
      isUnique: false,
      elementCount: 0,
      attributes,
      path
    }
  };
}

/**
 * Generate XPath selector
 */
function generateXPathSelector(element: any, attributes: ElementAttributes): SelectorResult {
  const xpath = generateXPathFromElement(element);

  return {
    selector: xpath,
    strategy: SelectorStrategy.XPATH,
    confidence: 0.6, // XPath is less preferred but reliable
    metadata: {
      isUnique: false,
      elementCount: 0,
      attributes,
      xpath
    }
  };
}

/**
 * Calculate confidence score for a selector
 */
function calculateSelectorConfidence(selector: SelectorResult, attributes: ElementAttributes): number {
  let confidence = selector.confidence;

  // Bonus for unique identifiers
  if (selector.metadata?.isUnique) {
    confidence += 0.1;
  }

  // Bonus for semantic HTML tags
  const semanticTags = ['button', 'input', 'select', 'textarea', 'a', 'form', 'nav', 'main', 'header', 'footer'];
  if (semanticTags.includes(attributes.tagName || '')) {
    confidence += 0.05;
  }

  // Penalty for generic classes
  const genericClasses = ['container', 'wrapper', 'row', 'col', 'div', 'span'];
  if (selector.selector.match(new RegExp(genericClasses.join('|')))) {
    confidence -= 0.1;
  }

  // Ensure confidence is within bounds
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Get the path of an element in the DOM tree
 */
function getElementPath(element: any): SelectorPath {
  const path: SelectorPath = {
    path: [],
    tags: [],
    classes: []
  };

  let current = element;
  let index = 0;

  while (current && current.tagName && index < 20) { // Limit depth to prevent infinite loops
    const siblings = Array.from(current.parentElement?.children || [])
      .filter((sibling: any) => sibling.tagName === current.tagName);

    const siblingIndex = siblings.indexOf(current);

    path.path.push(siblingIndex);
    path.tags.push(current.tagName.toLowerCase());

    const classes = current.className?.split(/\s+/).filter(Boolean) || [];
    path.classes.push(classes);

    current = current.parentElement;
    index++;
  }

  return path;
}

/**
 * Convert element path to CSS selector
 */
function pathToCssSelector(path: SelectorPath, attributes: ElementAttributes): string {
  const selectors: string[] = [];

  // Build selector from bottom up
  for (let i = path.tags.length - 1; i >= 0; i--) {
    const tag = path.tags[i];
    const index = path.path[i];
    const classes = path.classes[i];

    let selector = tag;

    // Add meaningful classes
    const meaningfulClasses = classes.filter(cls =>
      !cls.match(/^(active|selected|hidden|visible|disabled|enabled|focus|hover|container|wrapper)$/)
    );

    if (meaningfulClasses.length > 0) {
      selector += '.' + meaningfulClasses.join('.');
    }

    // Add nth-child if there are multiple siblings
    if (index > 0) {
      selector += `:nth-child(${index + 1})`;
    }

    selectors.push(selector);
  }

  return selectors.join(' > ');
}

/**
 * Generate XPath from DOM element
 */
function generateXPathFromElement(element: any): string {
  if (!element || !element.tagName) {
    return '';
  }

  // Simple XPath generation based on element position
  const parts: string[] = [];
  let current = element;

  while (current && current.nodeType === 1) { // Element node
    let index = 0;
    let sibling = current.previousSibling;

    while (sibling) {
      if (sibling.nodeType === 1 && sibling.tagName === current.tagName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }

    const tagName = current.tagName.toLowerCase();
    const path = index > 0 ? `${tagName}[${index + 1}]` : tagName;
    parts.unshift(path);

    current = current.parentNode;
  }

  return '//' + parts.join('/');
}

/**
 * Escape CSS values to handle special characters
 */
function escapeCssValue(value: string): string {
  return value.replace(/["'\\]/g, '\\$&').replace(/([:.[\]{}(),])/g, '\\$1');
}

/**
 * Validate a selector against the current document
 */
export function validateSelector(selector: string, document: Document): SelectorValidationResult {
  try {
    let elements: NodeListOf<Element> | null = null;

    // Try CSS selector first
    try {
      elements = document.querySelectorAll(selector);
    } catch (cssError) {
      // If CSS fails, try XPath
      if (selector.startsWith('//') || selector.startsWith('/')) {
        const result = document.evaluate(
          selector,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );

        return {
          isValid: result.snapshotLength > 0,
          matches: result.snapshotLength,
          element: result.snapshotItem(0) as Element
        };
      }

      return {
        isValid: false,
        matches: 0,
        error: `Invalid selector: ${cssError.message}`
      };
    }

    return {
      isValid: elements.length > 0,
      matches: elements.length,
      element: elements[0]
    };
  } catch (error) {
    return {
      isValid: false,
      matches: 0,
      error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Check if a selector is unique in the document
 */
export function isSelectorUnique(selector: string, document: Document): boolean {
  const validation = validateSelector(selector, document);
  return validation.isValid && validation.matches === 1;
}

/**
 * Find the best matching selector for an element from a list of candidates
 */
export function findBestSelector(
  element: Element,
  candidates: string[],
  document: Document
): SelectorResult | null {
  let bestSelector: SelectorResult | null = null;
  let highestScore = 0;

  for (const candidate of candidates) {
    const validation = validateSelector(candidate, document);

    if (validation.isValid && validation.element === element) {
      const score = calculateSelectorScore(candidate, validation.matches);

      if (score > highestScore) {
        highestScore = score;
        bestSelector = {
          selector: candidate,
          strategy: candidate.startsWith('//') ? SelectorStrategy.XPATH : SelectorStrategy.CSS_SELECTOR,
          confidence: score,
          metadata: {
            isUnique: validation.matches === 1,
            elementCount: validation.matches,
            attributes: extractElementAttributes(element)
          }
        };
      }
    }
  }

  return bestSelector;
}

/**
 * Calculate a score for a selector based on uniqueness and simplicity
 */
function calculateSelectorScore(selector: string, matchCount: number): number {
  let score = 1.0;

  // Penalize non-unique selectors
  if (matchCount > 1) {
    score -= (matchCount - 1) * 0.1;
  }

  // Penalize complex selectors
  const complexity = selector.split(/[ >+~]/).length;
  score -= (complexity - 1) * 0.05;

  // Penalize nth-child selectors
  const nthChildMatches = selector.match(/:nth-child\([^)]+\)/g);
  if (nthChildMatches) {
    score -= nthChildMatches.length * 0.1;
  }

  return Math.max(0, score);
}

/**
 * Handle iframe traversal for selector generation
 */
export function handleIframeTraversal(element: Element, options: SelectorOptions = {}): string | null {
  if (!options.traverseIframes) {
    return null;
  }

  const iframes = document.querySelectorAll('iframe');

  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];

    try {
      const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;

      if (iframeDocument) {
        // Check if element is inside this iframe
        if (iframeDocument.contains(element)) {
          const iframeSelector = generateSelectors(iframe, options)[0]?.selector;
          const innerSelector = generateSelectors(element, options)[0]?.selector;

          if (iframeSelector && innerSelector) {
            return `${iframeSelector} >>> ${innerSelector}`;
          }
        }
      }
    } catch (error) {
      // Cross-origin iframe, skip
      continue;
    }
  }

  return null;
}

/**
 * Handle shadow DOM traversal for selector generation
 */
export function handleShadowDOMTraversal(element: Element, options: SelectorOptions = {}): string | null {
  if (!options.traverseShadowDOM) {
    return null;
  }

  // Check if element is in shadow DOM
  let current: Element | null = element;
  const shadowHosts: Element[] = [];

  while (current) {
    if (current.getRootNode() instanceof ShadowRoot) {
      const shadowRoot = current.getRootNode() as ShadowRoot;
      const host = shadowRoot.host;

      if (host) {
        shadowHosts.push(host);
        current = host;
      } else {
        break;
      }
    } else {
      current = current.parentElement;
    }
  }

  if (shadowHosts.length === 0) {
    return null;
  }

  // Build selector path through shadow DOM
  const selectors: string[] = [];

  // Add host selectors
  for (const host of shadowHosts.reverse()) {
    const hostSelector = generateSelectors(host, options)[0]?.selector;
    if (hostSelector) {
      selectors.push(hostSelector);
    }
  }

  // Add inner element selector
  const innerSelector = generateSelectors(element, options)[0]?.selector;
  if (innerSelector) {
    selectors.push(innerSelector);
  }

  return selectors.join(' >>> ');
}

/**
 * Generate a composite selector that handles both iframes and shadow DOM
 */
export function generateCompositeSelector(element: Element, options: SelectorOptions = {}): SelectorResult {
  // Try iframe traversal
  const iframeSelector = handleIframeTraversal(element, options);
  if (iframeSelector) {
    return {
      selector: iframeSelector,
      strategy: SelectorStrategy.HYBRID,
      confidence: 0.8,
      metadata: {
        isUnique: true,
        elementCount: 1,
        attributes: extractElementAttributes(element),
        type: 'iframe'
      }
    };
  }

  // Try shadow DOM traversal
  const shadowSelector = handleShadowDOMTraversal(element, options);
  if (shadowSelector) {
    return {
      selector: shadowSelector,
      strategy: SelectorStrategy.HYBRID,
      confidence: 0.85,
      metadata: {
        isUnique: true,
        elementCount: 1,
        attributes: extractElementAttributes(element),
        type: 'shadow'
      }
    };
  }

  // Fall back to regular selector
  return generateSelectors(element, options)[0];
}

/**
 * Optimize a selector for better stability and readability
 */
export function optimizeSelector(selector: string, document: Document): string {
  // Remove redundant classes
  selector = selector.replace(/(\w+)\.(\w+-\w+)/g, '$1.$2');

  // Remove unnecessary nth-child when it's 1
  selector = selector.replace(/:nth-child\(1\)/g, ':first-child');

  // Combine adjacent selectors with same tag
  selector = selector.replace(/(\w+) > (\w+)/g, '$1 $2');

  // Validate the optimized selector
  const validation = validateSelector(selector, document);
  if (!validation.isValid) {
    // Return original if optimization broke it
    return selector;
  }

  return selector;
}

/**
 * Generate multiple selector options with different strategies
 */
export function generateMultipleSelectorOptions(
  element: Element,
  maxOptions: number = 5,
  document: Document
): SelectorResult[] {
  const options: SelectorOptions = {
    generateMultiple: true,
    maxSelectors: maxOptions * 2, // Generate more to filter
    minConfidence: 0.5 // Lower threshold to get more options
  };

  let selectors = generateSelectors(element, options);

  // Add composite selector if applicable
  const composite = generateCompositeSelector(element, options);
  if (composite && !selectors.find(s => s.selector === composite.selector)) {
    selectors.unshift(composite);
  }

  // Validate and filter selectors
  const validSelectors = selectors.filter(s => {
    const validation = validateSelector(s.selector, document);
    return validation.isValid && validation.element === element;
  });

  // Sort by confidence and return top options
  return validSelectors
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxOptions);
}

/**
 * Serialize selector result for storage or transmission
 */
export function serializeSelectorResult(result: SelectorResult): string {
  return JSON.stringify({
    selector: result.selector,
    strategy: result.strategy,
    confidence: result.confidence,
    metadata: result.metadata
  });
}

/**
 * Deserialize selector result from storage or transmission
 */
export function deserializeSelectorResult(data: string): SelectorResult {
  const parsed = JSON.parse(data);
  return {
    selector: parsed.selector,
    strategy: parsed.strategy,
    confidence: parsed.confidence,
    metadata: parsed.metadata
  };
}

/**
 * Create a selector cache for performance optimization
 */
export class SelectorCache {
  private cache = new Map<string, SelectorResult[]>();
  private maxSize = 1000;

  get(key: string): SelectorResult[] | undefined {
    const result = this.cache.get(key);
    if (result) {
      // Move to end (LRU)
      this.cache.delete(key);
      this.cache.set(key, result);
    }
    return result;
  }

  set(key: string, value: SelectorResult[]): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Export a singleton cache instance
export const selectorCache = new SelectorCache();

/**
 * Batch generate selectors for multiple elements
 */
export function batchGenerateSelectors(
  elements: Element[],
  options: SelectorOptions = {}
): Map<Element, SelectorResult[]> {
  const results = new Map<Element, SelectorResult[]>();

  for (const element of elements) {
    try {
      const selectors = generateMultipleSelectorOptions(element, options.maxSelectors || 3, document);
      results.set(element, selectors);
    } catch (error) {
      console.error('Failed to generate selectors for element:', error);
      results.set(element, []);
    }
  }

  return results;
}