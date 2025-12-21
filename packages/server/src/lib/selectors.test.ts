/**
 * Test examples for selector generation utilities
 * This file demonstrates how to use the selector utilities in the Stepwise browser recorder
 */

import {
  generateSelectors,
  generateMultipleSelectorOptions,
  validateSelector,
  isSelectorUnique,
  generateCompositeSelector,
  optimizeSelector,
  SelectorStrategy,
  type SelectorOptions,
  type SelectorResult
} from './selectors';

/**
 * Example: Generate selectors for a button element
 */
export function generateButtonSelectors(buttonElement: HTMLButtonElement): SelectorResult[] {
  const options: SelectorOptions = {
    strategy: SelectorStrategy.CSS_SELECTOR,
    includeTestAttributes: true,
    minConfidence: 0.8,
    generateMultiple: true,
    maxSelectors: 5
  };

  return generateSelectors(buttonElement, options);
}

/**
 * Example: Find the most reliable selector for any element
 */
export function findMostReliableSelector(element: Element, document: Document): SelectorResult | null {
  // Generate multiple options
  const options = generateMultipleSelectorOptions(element, 5, document);

  if (options.length === 0) {
    return null;
  }

  // Filter for unique selectors
  const uniqueSelectors = options.filter(s => s.metadata?.isUnique);

  // Return the highest confidence unique selector, or fall back to the first one
  return uniqueSelectors.length > 0
    ? uniqueSelectors[0]
    : options[0];
}

/**
 * Example: Handle elements in iframes or shadow DOM
 */
export function handleComplexElement(element: Element, document: Document): SelectorResult | null {
  // First try composite selector (handles iframes/shadow DOM)
  const compositeSelector = generateCompositeSelector(element);

  // Validate it
  const validation = validateSelector(compositeSelector.selector, document);

  if (validation.isValid && validation.element === element) {
    return compositeSelector;
  }

  // Fall back to regular selectors
  return findMostReliableSelector(element, document);
}

/**
 * Example: Optimize existing selectors for better performance
 */
export function optimizeExistingSelector(selector: string, document: Document): string {
  const optimized = optimizeSelector(selector, document);

  // Verify the optimized selector still works
  const originalValidation = validateSelector(selector, document);
  const optimizedValidation = validateSelector(optimized, document);

  // Return optimized if it still matches the same element(s)
  if (optimizedValidation.isValid &&
      optimizedValidation.matches === originalValidation.matches) {
    return optimized;
  }

  return selector;
}

/**
 * Example: Create a robust element identification strategy
 */
export class ElementIdentifier {
  private cache = new Map<Element, SelectorResult>();

  identify(element: Element, document: Document): SelectorResult | null {
    // Check cache first
    if (this.cache.has(element)) {
      const cached = this.cache.get(element)!;

      // Verify cached selector still works
      const validation = validateSelector(cached.selector, document);
      if (validation.isValid && validation.element === element) {
        return cached;
      }

      // Remove stale cache entry
      this.cache.delete(element);
    }

    // Generate new selector
    const selector = findMostReliableSelector(element, document);

    if (selector) {
      this.cache.set(element, selector);
    }

    return selector;
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Handle page changes
  handlePageChange(): void {
    // Optionally clear cache or mark entries for verification
    this.clearCache();
  }
}

/**
 * Example usage in a recording scenario
 */
export class InteractionRecorder {
  private identifier = new ElementIdentifier();
  private recordedInteractions: Array<{
    type: string;
    selector: string;
    timestamp: number;
    metadata?: any;
  }> = [];

  recordInteraction(element: Element, interactionType: string, document: Document): void {
    const selectorResult = this.identifier.identify(element, document);

    if (!selectorResult) {
      console.warn('Could not generate reliable selector for element', element);
      return;
    }

    this.recordedInteractions.push({
      type: interactionType,
      selector: selectorResult.selector,
      timestamp: Date.now(),
      metadata: {
        strategy: selectorResult.strategy,
        confidence: selectorResult.confidence,
        attributes: selectorResult.metadata?.attributes
      }
    });
  }

  getRecordedInteractions(): Array<{
    type: string;
    selector: string;
    timestamp: number;
    metadata?: any;
  }> {
    return [...this.recordedInteractions];
  }

  clear(): void {
    this.recordedInteractions = [];
    this.identifier.clearCache();
  }
}

/**
 * Example: Handle dynamic content and retry logic
 */
export async function waitForElement(selector: string, document: Document, timeout: number = 5000): Promise<Element | null> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const checkElement = () => {
      const validation = validateSelector(selector, document);

      if (validation.isValid && validation.element) {
        resolve(validation.element);
        return;
      }

      if (Date.now() - startTime > timeout) {
        resolve(null);
        return;
      }

      // Check again in 100ms
      setTimeout(checkElement, 100);
    };

    checkElement();
  });
}

/**
 * Example: Generate fallback selectors for resilience
 */
export function generateFallbackSelectors(element: Element, document: Document): SelectorResult[] {
  const primary = generateMultipleSelectorOptions(element, 3, document);

  // Generate additional fallback selectors with lower confidence
  const fallbackOptions: SelectorOptions = {
    minConfidence: 0.3,
    generateMultiple: true,
    maxSelectors: 5
  };

  const fallback = generateSelectors(element, fallbackOptions);

  // Combine and ensure uniqueness
  const allSelectors = [...primary, ...fallback]
    .filter((s, index, arr) => arr.findIndex(x => x.selector === s.selector) === index)
    .sort((a, b) => b.confidence - a.confidence);

  return allSelectors;
}

/**
 * Example: Export/Import selectors for cross-session storage
 */
export function exportSelectors(selectors: SelectorResult[]): string {
  return JSON.stringify({
    version: '1.0',
    timestamp: Date.now(),
    selectors: selectors.map(s => ({
      selector: s.selector,
      strategy: s.strategy,
      confidence: s.confidence,
      metadata: s.metadata
    }))
  }, null, 2);
}

export function importSelectors(data: string): SelectorResult[] {
  try {
    const parsed = JSON.parse(data);
    return parsed.selectors || [];
  } catch (error) {
    console.error('Failed to import selectors:', error);
    return [];
  }
}