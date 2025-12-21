/**
 * Comprehensive type definitions for browser recording steps in Stepwise
 *
 * This module defines all types related to recorded browser actions,
 * including actions, metadata, screenshots, and validation rules.
 */

/**
 * Enumeration of all supported browser action types
 * Each type represents a specific user interaction that can be recorded
 */
export enum StepType {
  /** Mouse click interaction (left, right, middle) */
  CLICK = 'click',

  /** Keyboard input typing */
  TYPE = 'type',

  /** Page scrolling (vertical or horizontal) */
  SCROLL = 'scroll',

  /** Page navigation to a new URL */
  NAVIGATE = 'navigate',

  /** Waiting for conditions or time */
  WAIT = 'wait',

  /** Mouse hover over element */
  HOVER = 'hover',

  /** Drag and drop interaction */
  DRAG_AND_DROP = 'drag_and_drop',

  /** File upload */
  UPLOAD = 'upload',

  /** Form submission */
  SUBMIT = 'submit',

  /** Selecting dropdown/option */
  SELECT = 'select',

  /** Keyboard key press (enter, tab, etc.) */
  KEYPRESS = 'keypress',

  /** Double click */
  DOUBLE_CLICK = 'double_click',

  /** Right click */
  RIGHT_CLICK = 'right_click',

  /** Element focus */
  FOCUS = 'focus',

  /** Element blur */
  BLUR = 'blur',

  /** Browser resize */
  RESIZE = 'resize',

  /** Take screenshot */
  SCREENSHOT = 'screenshot',

  /** Execute custom JavaScript */
  EXECUTE_SCRIPT = 'execute_script'
}

/**
 * Represents the coordinates for mouse interactions
 */
export interface Coordinates {
  /** X coordinate in pixels */
  readonly x: number;

  /** Y coordinate in pixels */
  readonly y: number;

  /** Optional offset from element center */
  readonly offsetX?: number;

  /** Optional offset from element center */
  readonly offsetY?: number;
}

/**
 * Represents CSS selector information for element targeting
 */
export interface SelectorInfo {
  /** Primary CSS selector string */
  readonly selector: string;

  /** Alternative selectors for robustness */
  readonly alternatives?: string[];

  /** XPath selector as fallback */
  readonly xpath?: string;

  /** Element text content for verification */
  readonly text?: string;

  /** Element attributes for identification */
  readonly attributes?: Record<string, string>;

  /** Element tag name */
  readonly tagName?: string;

  /** Element class name(s) */
  readonly className?: string;

  /** Element ID */
  readonly id?: string;
}

/**
 * Represents the primary action data for a recorded step
 */
export interface StepAction {
  /** Type of action performed */
  readonly type: StepType;

  /** Element selector information */
  readonly selector?: SelectorInfo;

  /** Value associated with the action (text to type, file to upload, etc.) */
  readonly value?: string | string[];

  /** Mouse/interaction coordinates */
  readonly coordinates?: Coordinates;

  /** Starting coordinates for drag operations */
  readonly startCoordinates?: Coordinates;

  /** Ending coordinates for drag operations */
  readonly endCoordinates?: Coordinates;

  /** Keyboard modifiers held during action */
  readonly modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;

  /** Mouse button used (left, right, middle) */
  readonly button?: 'left' | 'right' | 'middle';

  /** Scroll direction and amount */
  readonly scrollDirection?: 'vertical' | 'horizontal';

  /** Scroll amount in pixels */
  readonly scrollAmount?: number;

  /** Wait duration in milliseconds */
  readonly waitDuration?: number;

  /** Navigation target URL */
  readonly url?: string;

  /** Form field type for typing actions */
  readonly fieldType?: 'input' | 'textarea' | 'contenteditable' | 'select';

  /** Selected option(s) for select actions */
  readonly selectedOptions?: string[];

  /** Window dimensions for resize actions */
  readonly dimensions?: {
    readonly width: number;
    readonly height: number;
  };

  /** JavaScript code to execute */
  readonly script?: string;

  /** Script execution result */
  readonly scriptResult?: unknown;
}

/**
 * Represents screenshot data associated with a step
 */
export interface StepScreenshot {
  /** Base64-encoded screenshot data */
  readonly dataUrl: string;

  /** Screenshot width in pixels */
  readonly width: number;

  /** Screenshot height in pixels */
  readonly height: number;

  /** Device pixel ratio */
  readonly devicePixelRatio?: number;

  /** Element highlighting information */
  readonly elementHighlight?: {
    /** Highlighted element selector */
    readonly selector: string;

    /** Highlight bounding box */
    readonly boundingBox: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };

    /** Highlight color in hex format */
    readonly color?: string;
  };

  /** Thumbnail version of screenshot */
  readonly thumbnail?: {
    readonly dataUrl: string;
    readonly width: number;
    readonly height: number;
  };
}

/**
 * Represents metadata about the step execution context
 */
export interface StepMetadata {
  /** ISO timestamp when step was recorded */
  readonly timestamp: string;

  /** Current page URL when step was recorded */
  readonly url: string;

  /** Page title when step was recorded */
  readonly pageTitle: string;

  /** User agent string */
  readonly userAgent?: string;

  /** Browser viewport dimensions */
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };

  /** Page scroll position */
  readonly scrollPosition?: {
    readonly x: number;
    readonly y: number;
  };

  /** Browser zoom level */
  readonly zoomLevel?: number;

  /** Execution duration in milliseconds */
  readonly duration?: number;

  /** Browser console logs during step */
  readonly consoleLogs?: Array<{
    readonly level: 'log' | 'warn' | 'error' | 'info' | 'debug';
    readonly message: string;
    readonly timestamp: string;
    readonly source?: string;
  }>;

  /** Network requests triggered by step */
  readonly networkRequests?: Array<{
    readonly url: string;
    readonly method: string;
    readonly status: number;
    readonly timestamp: string;
    readonly duration?: number;
  }>;
}

/**
 * Represents validation rules for step verification
 */
export interface StepValidation {
  /** Whether step validation is enabled */
  readonly enabled: boolean;

  /** Expected conditions to verify after step execution */
  readonly expectations?: Array<{
    /** Type of validation check */
    readonly type:
      | 'element_exists'
      | 'element_visible'
      | 'element_hidden'
      | 'text_contains'
      | 'text_equals'
      | 'attribute_contains'
      | 'attribute_equals'
      | 'url_contains'
      | 'url_equals'
      | 'title_contains'
      | 'title_equals'
      | 'element_count'
      | 'custom_script';

    /** Validation target (selector, URL, etc.) */
    readonly target: string;

    /** Expected value for comparison */
    readonly expected?: string | number;

    /** Custom validation script */
    readonly script?: string;

    /** Validation timeout in milliseconds */
    readonly timeout?: number;

    /** Whether validation is required for step success */
    readonly required?: boolean;
  }>;

  /** Validation results after step execution */
  readonly results?: Array<{
    /** Whether validation passed */
    readonly passed: boolean;

    /** Validation error message if failed */
    readonly error?: string;

    /** Actual value found during validation */
    readonly actual?: unknown;

    /** Validation execution time */
    readonly duration: number;
  }>;
}

/**
 * Represents a single recorded step in a browser session
 */
export interface Step {
  /** Unique identifier for the step */
  readonly id: string;

  /** Session identifier this step belongs to */
  readonly sessionId: string;

  /** Sequential order of step in session */
  readonly order: number;

  /** Human-readable step title */
  readonly title: string;

  /** Detailed step description */
  readonly description?: string;

  /** Primary action data */
  readonly action: StepAction;

  /** Screenshot data if captured */
  readonly screenshot?: StepScreenshot;

  /** Step execution metadata */
  readonly metadata: StepMetadata;

  /** Step validation rules and results */
  readonly validation?: StepValidation;

  /** Whether step is marked as favorite */
  readonly favorite?: boolean;

  /** Step tags for categorization */
  readonly tags?: string[];

  /** Parent step ID if this is a sub-step */
  readonly parentId?: string;

  /** Child step IDs if this has sub-steps */
  readonly childIds?: string[];

  /** Whether step can be replayed */
  readonly replayable: boolean;

  /** Step retry configuration */
  readonly retryConfig?: {
    readonly maxAttempts: number;
    readonly retryDelay: number;
    readonly retryOnFailure: string[];
  };
}

/**
 * Represents a collection of steps forming a complete recording session
 */
export interface StepSession {
  /** Unique session identifier */
  readonly id: string;

  /** Session title */
  readonly title: string;

  /** Session description */
  readonly description?: string;

  /** All steps in the session */
  readonly steps: Step[];

  /** Session creation timestamp */
  readonly createdAt: string;

  /** Session last modified timestamp */
  readonly updatedAt: string;

  /** Session metadata */
  readonly metadata: {
    /** Browser used for recording */
    readonly browser: string;

    /** Browser version */
    readonly browserVersion?: string;

    /** Operating system */
    readonly os: string;

    /** Screen resolution */
    readonly screenResolution?: string;

    /** Total session duration */
    readonly duration: number;

    /** Number of steps in session */
    readonly stepCount: number;

    /** Session tags */
    readonly tags?: string[];
  };
}

/**
 * Type guard to check if a value is a valid StepType
 */
export function isValidStepType(value: unknown): value is StepType {
  return Object.values(StepType).includes(value as StepType);
}

/**
 * Type guard to check if an action has coordinates
 */
export function hasCoordinates(action: StepAction): action is StepAction & {
  readonly coordinates: Coordinates;
} {
  return action.coordinates !== undefined;
}

/**
 * Type guard to check if a step has a screenshot
 */
export function hasScreenshot(step: Step): step is Step & {
  readonly screenshot: StepScreenshot;
} {
  return step.screenshot !== undefined;
}

/**
 * Type guard to check if validation is enabled and has expectations
 */
export function hasValidation(step: Step): step is Step & {
  readonly validation: NonNullable<StepValidation> & {
    readonly expectations: NonNullable<StepValidation['expectations']>;
  };
} {
  return step.validation?.enabled === true &&
         step.validation.expectations !== undefined &&
         step.validation.expectations.length > 0;
}

/**
 * Utility type to extract all clickable step types
 */
export type ClickableStepType = Extract<
  StepType,
  StepType.CLICK |
  StepType.DOUBLE_CLICK |
  StepType.RIGHT_CLICK
>;

/**
 * Utility type to extract all input-related step types
 */
export type InputStepType = Extract<
  StepType,
  StepType.TYPE |
  StepType.SELECT |
  StepType.UPLOAD
>;

/**
 * Utility type to extract all navigation-related step types
 */
export type NavigationStepType = Extract<
  StepType,
  StepType.NAVIGATE |
  StepType.SCROLL
>;

/**
 * Utility type for step creation with optional fields
 */
export type CreateStepRequest = Omit<
  Step,
  'id' | 'timestamp' | 'order' | 'replayable'
> & {
  /** Optional step ID (will be generated if not provided) */
  id?: string;

  /** Optional timestamp (will use current time if not provided) */
  timestamp?: string;

  /** Optional order (will be calculated if not provided) */
  order?: number;
};

/**
 * Utility type for step updates
 */
export type UpdateStepRequest = Partial<
  Omit<Step, 'id' | 'sessionId' | 'createdAt'>
> & {
  /** Updated timestamp */
  readonly updatedAt: string;
};

/**
 * Error types that can occur during step execution
 */
export enum StepErrorType {
  /** Element not found */
  ELEMENT_NOT_FOUND = 'element_not_found',

  /** Element not visible */
  ELEMENT_NOT_VISIBLE = 'element_not_visible',

  /** Element not interactable */
  ELEMENT_NOT_INTERACTABLE = 'element_not_interactable',

  /** Timeout exceeded */
  TIMEOUT = 'timeout',

  /** Network error */
  NETWORK_ERROR = 'network_error',

  /** JavaScript execution error */
  SCRIPT_ERROR = 'script_error',

  /** Validation failed */
  VALIDATION_FAILED = 'validation_failed',

  /** Unknown error */
  UNKNOWN = 'unknown'
}

/**
 * Represents an error that occurred during step execution
 */
export interface StepError {
  /** Error type */
  readonly type: StepErrorType;

  /** Error message */
  readonly message: string;

  /** Stack trace if available */
  readonly stack?: string;

  /** Step ID that caused the error */
  readonly stepId: string;

  /** Error timestamp */
  readonly timestamp: string;

  /** Additional error context */
  readonly context?: Record<string, unknown>;
}