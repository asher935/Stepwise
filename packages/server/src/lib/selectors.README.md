# Stepwise Selector Utilities

Comprehensive selector generation utilities for the Stepwise browser recorder, providing robust element identification strategies for recording and replaying user interactions.

## Overview

The selector utilities provide multiple strategies for identifying DOM elements with varying levels of stability and reliability. They are designed to handle real-world web applications with dynamic content, iframes, and shadow DOM.

## Features

- **Multiple Selector Strategies**: CSS selectors, XPath, text-based, attribute-based, and structural selectors
- **Selector Optimization**: Automatic optimization for better stability and performance
- **Confidence Scoring**: Each selector is scored based on reliability (0-1)
- **Edge Case Handling**: Support for iframes, shadow DOM, and dynamic content
- **Caching**: Built-in LRU cache for performance optimization
- **Validation**: Comprehensive selector validation against the DOM
- **Batch Processing**: Efficiently handle multiple elements

## Basic Usage

```typescript
import {
  generateSelectors,
  generateMultipleSelectorOptions,
  validateSelector,
  findBestSelector
} from './selectors';

// Generate the best selector for an element
const element = document.querySelector('#my-button');
const selectors = generateSelectors(element);
console.log(selectors[0].selector); // Most reliable selector
console.log(selectors[0].confidence); // Confidence score

// Generate multiple selector options
const options = generateMultipleSelectorOptions(element, 5, document);
console.log(options.map(s => `${s.selector} (${s.confidence})`));

// Validate a selector
const validation = validateSelector('#my-button', document);
console.log(validation.isValid); // true/false
console.log(validation.matches); // Number of matching elements
```

## Selector Strategies

### 1. ID-based (Most Stable)
```typescript
// Generated for: <button id="submit-btn">
const selector = '#submit-btn'; // Confidence: 1.0
```

### 2. Test Attributes (Very Stable)
```typescript
// Generated for: <button data-testid="submit-button">
const selector = '[data-testid="submit-button"]'; // Confidence: 0.95
```

### 3. Name Attribute (Stable)
```typescript
// Generated for: <input name="username">
const selector = '[name="username"]'; // Confidence: 0.9
```

### 4. ARIA Attributes (Good)
```typescript
// Generated for: <button aria-label="Submit form">
const selector = '[aria-label="Submit form"]'; // Confidence: 0.85
```

### 5. Class-based (Moderate)
```typescript
// Generated for: <button class="btn btn-primary">
const selector = '.btn-primary'; // Confidence: 0.6
```

### 6. Text-based (Variable)
```typescript
// Generated for: <button>Click Me</button>
const selector = 'button[text="Click Me"]'; // Confidence: 0.5
```

### 7. XPath (Fallback)
```typescript
// Generated as last resort
const selector = '//div[@id="container"]/button[1]'; // Confidence: 0.6
```

## Advanced Features

### Handling Iframes
```typescript
import { handleIframeTraversal } from './selectors';

// Generates: iframe#content-frame >>> button#submit
const iframeSelector = handleIframeTraversal(element, {
  traverseIframes: true
});
```

### Handling Shadow DOM
```typescript
import { handleShadowDOMTraversal } from './selectors';

// Generates: custom-component >>> div.container >>> button
const shadowSelector = handleShadowDOMTraversal(element, {
  traverseShadowDOM: true
});
```

### Selector Optimization
```typescript
import { optimizeSelector } from './selectors';

const optimized = optimizeSelector(
  'div.container > div.row > div.col > button.btn',
  document
);
// Result: .container button.btn
```

### Caching
```typescript
import { selectorCache } from './selectors';

// Cache automatically handled by generateSelectors
// Manual cache management:
selectorCache.clear();
console.log(selectorCache.size());
```

## Configuration Options

```typescript
interface SelectorOptions {
  strategy?: SelectorStrategy;        // Preferred strategy
  includeTestAttributes?: boolean;   // Include test attributes
  minConfidence?: number;           // Minimum confidence score
  generateMultiple?: boolean;       // Generate multiple options
  maxSelectors?: number;            // Maximum selectors to generate
  traverseIframes?: boolean;        // Handle iframe traversal
  traverseShadowDOM?: boolean;      // Handle shadow DOM traversal
}
```

## API Reference

### Core Functions

- `generateSelectors(element, options?)`: Generate optimal selectors
- `extractElementAttributes(element)`: Extract element attributes
- `validateSelector(selector, document)`: Validate selector against DOM
- `isSelectorUnique(selector, document)`: Check if selector is unique
- `findBestSelector(element, candidates, document)`: Find best from candidates

### Advanced Functions

- `handleIframeTraversal(element, options?)`: Handle iframe elements
- `handleShadowDOMTraversal(element, options?)`: Handle shadow DOM
- `generateCompositeSelector(element, options?)`: Generate hybrid selector
- `optimizeSelector(selector, document)`: Optimize selector
- `generateMultipleSelectorOptions(element, max, document)`: Multiple options
- `batchGenerateSelectors(elements, options?)`: Batch processing

### Utility Classes

- `SelectorCache`: LRU cache for selector storage
- `ElementIdentifier`: Robust element identification
- `InteractionRecorder`: Record interactions with reliable selectors

## Best Practices

1. **Prefer Stable Selectors**: Always use IDs or test attributes when available
2. **Validate Selectors**: Always validate selectors before using them
3. **Handle Dynamic Content**: Use fallback selectors for dynamic pages
4. **Cache Responsibly**: Clear cache on page navigation
5. **Test Thoroughly**: Verify selectors work across different page states

## Performance Considerations

- Use caching for frequently accessed elements
- Limit selector complexity when possible
- Avoid expensive XPath expressions
- Batch process multiple elements when needed
- Clear cache on significant page changes

## Edge Cases Handled

- Elements without unique identifiers
- Dynamic content loading
- Cross-origin iframes
- Nested shadow DOM
- Elements with similar attributes
- Page structure changes

## Example: Complete Recording Session

```typescript
import { InteractionRecorder } from './selectors.test';

const recorder = new InteractionRecorder();

// Record a click
document.addEventListener('click', (event) => {
  recorder.recordInteraction(event.target, 'click', document);
});

// Get recorded interactions
const interactions = recorder.getRecordedInteractions();
console.log('Recorded:', interactions);

// Clear for next session
recorder.clear();
```

## Error Handling

The utilities include comprehensive error handling:

```typescript
try {
  const selectors = generateSelectors(element);
} catch (error) {
  console.error('Selector generation failed:', error);
  // Fallback to manual selector or user intervention
}
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type { SelectorResult, SelectorOptions, SelectorStrategy } from './selectors';

const result: SelectorResult = {
  selector: '#my-button',
  strategy: SelectorStrategy.CSS_SELECTOR,
  confidence: 1.0
};
```