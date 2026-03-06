/** Highlight information for an element */
export interface StepHighlight {
  /** CSS selector for re-targeting (null if unreliable) */
  selector: string | null;
  /** Absolute position at capture time */
  boundingBox: { x: number; y: number; width: number; height: number };
  /** HTML tag name */
  elementTag: string;
  /** Visible text, truncated */
  elementText: string | null;
}

export interface StepLegendItem {
  bubbleNumber: number;
  label: string;
  kind: 'field' | 'button';
  inViewport?: boolean;
  semanticKey?: 'username' | 'password';
  boundingBox: { x: number; y: number; width: number; height: number };
}

export type ScreenshotMode = 'zoomed' | 'viewport' | 'fullPage';

/** Base step interface */
export interface BaseStep {
  id: string;
  index: number;
  timestamp: number;
  screenshotPath: string;
  screenshotDataUrl?: string;
  fullScreenshotPath?: string;
  fullScreenshotDataUrl?: string;
  pageScreenshotPath?: string;
  pageScreenshotDataUrl?: string;
  selectedScreenshotMode?: ScreenshotMode;
  caption: string;
  isEdited: boolean;
  screenshotClip?: { x: number; y: number; width: number; height: number };
  redactionRects?: Array<{ x: number; y: number; width: number; height: number }>;
  redactScreenshot?: boolean;
  redactedScreenshotPath?: string;
  /** Stores the original screenshot URL before redaction is applied */
  originalScreenshotDataUrl?: string;
  highlightColor?: string;
  legendItems?: StepLegendItem[];
  pageLegendItems?: StepLegendItem[];
}

/** Click action step */
export interface ClickStep extends BaseStep {
  action: 'click';
  target: StepHighlight;
  button: 'left' | 'right' | 'middle';
}

/** Type action step */
export interface TypeStep extends BaseStep {
  action: 'type';
  target: StepHighlight;
  fieldName: string;
  redactScreenshot: boolean;
  displayText: string;
  rawValue?: string;
}

/** Paste action step */
export interface PasteStep extends BaseStep {
  action: 'paste';
  target: StepHighlight;
  fieldName: string;
  redactScreenshot: boolean;
  displayText: string;
  rawValue: string; // Pasted content
}

/** Navigate action step */
export interface NavigateStep extends BaseStep {
  action: 'navigate';
  fromUrl: string;
  toUrl: string;
}

/** Scroll action step */
export interface ScrollStep extends BaseStep {
  action: 'scroll';
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
}

/** Select (dropdown) action step */
export interface SelectStep extends BaseStep {
  action: 'select';
  target: StepHighlight;
  selectedValue: string;
  selectedText: string;
}

/** Hover action step */
export interface HoverStep extends BaseStep {
  action: 'hover';
  target: StepHighlight;
}

/** Union of all step types */
export type Step =
  | ClickStep
  | TypeStep
  | NavigateStep
  | ScrollStep
  | SelectStep
  | HoverStep
  | PasteStep;

/** Step action types */
export type StepAction = Step['action'];

/** Request to update a step */
export interface UpdateStepRequest {
  caption?: string;
  isEdited?: boolean;
  redactScreenshot?: boolean;
  redactedScreenshotPath?: string;
  legendItems?: StepLegendItem[];
  pageLegendItems?: StepLegendItem[];
  selectedScreenshotMode?: ScreenshotMode;
}
