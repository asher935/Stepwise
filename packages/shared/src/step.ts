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

/** Base step interface */
export interface BaseStep {
  id: string;
  index: number;
  timestamp: number;
  screenshotPath: string;
  screenshotDataUrl?: string;
  caption: string;
  isEdited: boolean;
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
  redacted: true;
  displayText: string;
  rawValue?: string;
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
  | HoverStep;

/** Step action types */
export type StepAction = Step['action'];

/** Request to update a step */
export interface UpdateStepRequest {
  caption?: string;
  isEdited?: boolean;
}