/**
 * Recorder Service for Stepwise Browser Recording
 *
 * This service captures browser interactions and converts them into
 * structured step-by-step guides with intelligent filtering and optimization.
 */

import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type {
  Step,
  StepType,
  StepAction,
  StepMetadata,
  StepScreenshot,
  Coordinates,
  SelectorInfo,
  StepValidation
} from '@stepwise/shared';
import { generateSelectors, generateCompositeSelector, type SelectorOptions } from '../lib/selectors.js';

/**
 * Configuration options for the Recorder service
 */
export interface RecorderConfig {
  /** Selector generation options */
  selectorOptions?: SelectorOptions;
  /** Screenshot capture settings */
  screenshot?: {
    /** Whether to capture screenshots for each step */
    enabled: boolean;
    /** Quality of screenshots (0-100) */
    quality: number;
    /** Maximum dimensions */
    maxWidth?: number;
    maxHeight?: number;
    /** Whether to highlight interacted elements */
    highlightElements: boolean;
    /** Highlight color */
    highlightColor?: string;
  };
  /** Recording sensitivity settings */
  sensitivity?: {
    /** Minimum time between steps in ms to avoid duplicates */
    minStepInterval: number;
    /** Minimum scroll amount to record */
    minScrollAmount: number;
    /** Whether to record rapid successive clicks */
    recordRapidClicks: boolean;
    /** Maximum typing delay before splitting into separate steps */
    maxTypingDelay: number;
  };
  /** Step optimization settings */
  optimization?: {
    /** Whether to consolidate similar steps */
    consolidateSteps: boolean;
    /** Maximum number of steps to consolidate */
    maxConsolidateSteps: number;
    /** Default wait duration between steps in ms */
    defaultWaitDuration: number;
    /** Whether to add intelligent waits */
    addIntelligentWaits: boolean;
  };
}

/**
 * Browser event types
 */
export enum BrowserEventType {
  /** Mouse click */
  CLICK = 'click',
  /** Mouse double click */
  DOUBLE_CLICK = 'dblclick',
  /** Mouse right click */
  CONTEXT_MENU = 'contextmenu',
  /** Mouse down */
  MOUSE_DOWN = 'mousedown',
  /** Mouse up */
  MOUSE_UP = 'mouseup',
  /** Mouse move */
  MOUSE_MOVE = 'mousemove',
  /** Mouse over */
  MOUSE_OVER = 'mouseover',
  /** Mouse out */
  MOUSE_OUT = 'mouseout',
  /** Key press */
  KEY_DOWN = 'keydown',
  /** Key release */
  KEY_UP = 'keyup',
  /** Input change */
  INPUT = 'input',
  /** Form submit */
  SUBMIT = 'submit',
  /** Focus */
  FOCUS = 'focus',
  /** Blur */
  BLUR = 'blur',
  /** Scroll */
  SCROLL = 'scroll',
  /** Resize */
  RESIZE = 'resize',
  /** Navigation */
  NAVIGATION = 'navigation',
  /** Page load */
  LOAD = 'load',
  /** Error */
  ERROR = 'error'
}

/**
 * Browser event data
 */
export interface BrowserEvent {
  /** Event type */
  type: BrowserEventType;
  /** Timestamp when event occurred */
  timestamp: number;
  /** Target element information */
  target?: {
    tagName: string;
    id?: string;
    className?: string;
    text?: string;
    attributes?: Record<string, string>;
    xpath?: string;
    selector?: string;
  };
  /** Mouse position if applicable */
  position?: Coordinates;
  /** Scroll position if applicable */
  scrollPosition?: Coordinates;
  /** Viewport dimensions */
  viewport?: {
    width: number;
    height: number;
  };
  /** Device pixel ratio */
  devicePixelRatio?: number;
  /** Page URL */
  url: string;
  /** Page title */
  pageTitle?: string;
  /** Event-specific data */
  data?: any;
}

/**
 * Raw step before processing
 */
export interface RawStep {
  /** Unique step identifier */
  id: string;
  /** Step type */
  type: StepType;
  /** Step title */
  title: string;
  /** Step description */
  description?: string;
  /** Action data */
  action: Partial<StepAction>;
  /** Selector information */
  selector?: SelectorInfo;
  /** Screenshot data */
  screenshot?: StepScreenshot;
  /** Metadata */
  metadata?: Partial<StepMetadata>;
  /** Whether step is replayable */
  replayable: boolean;
  /** Raw event */
  event: BrowserEvent;
  /** Whether this step can be consolidated */
  canConsolidate: boolean;
  /** Timestamp when created */
  createdAt: number;
}

/**
 * Recording session state
 */
export interface RecordingSession {
  /** Session ID */
  id: string;
  /** Whether recording is active */
  isRecording: boolean;
  /** Whether recording is paused */
  isPaused: boolean;
  /** Session start time */
  startedAt: Date;
  /** Last pause time */
  pausedAt?: Date;
  /** Total paused duration */
  totalPausedDuration: number;
  /** Current step counter */
  stepCounter: number;
  /** Current URL */
  currentUrl: string;
  /** Previous URL for navigation detection */
  previousUrl?: string;
  /** Last event timestamp */
  lastEventTimestamp?: number;
  /** Pending steps being processed */
  pendingSteps: Map<string, RawStep>;
  /** Consolidated actions buffer */
  actionBuffer: Map<string, Partial<StepAction>>;
  /** Recorded steps */
  steps: Step[];
}

/**
 * Step post-processor hook type
 */
export type StepPostProcessor = (step: Step, session: RecordingSession) => Step | null;

/**
 * Step validator hook type
 */
export type StepValidator = (step: Step) => boolean;

/**
 * Event emitted when a step is created
 */
export interface StepCreatedEvent {
  /** The created step */
  step: Step;
  /** Session ID */
  sessionId: string;
}

/**
 * Event emitted when steps are consolidated
 */
export interface StepsConsolidatedEvent {
  /** Original steps that were consolidated */
  originalSteps: Step[];
  /** New consolidated step */
  consolidatedStep: Step;
  /** Session ID */
  sessionId: string;
}

/**
 * Recorder Service Events
 */
export interface RecorderEvents {
  'step:created': (event: StepCreatedEvent) => void;
  'step:updated': (step: Step) => void;
  'steps:consolidated': (event: StepsConsolidatedEvent) => void;
  'step:captured': (sessionId: string, step: Step) => void;
  'screenshot:captured': (data: { stepId: string; screenshot: StepScreenshot }) => void;
  'error': (error: Error) => void;
}

export declare interface Recorder {
  on<U extends keyof RecorderEvents>(
    event: U,
    listener: RecorderEvents[U]
  ): this;
  emit<U extends keyof RecorderEvents>(
    event: U,
    ...args: Parameters<RecorderEvents[U]>
  ): boolean;
}

/**
 * Main Recorder Service class
 */
export class Recorder extends EventEmitter {
  private config: Required<RecorderConfig>;
  private sessions = new Map<string, RecordingSession>();
  private stepPostProcessors: StepPostProcessor[] = [];
  private stepValidators: StepValidator[] = [];

  constructor(config: RecorderConfig = {}) {
    super();

    // Set default configuration
    this.config = {
      selectorOptions: {
        prioritizeId: true,
        prioritizeClass: true,
        prioritizeText: true,
        prioritizeDataAttributes: false,
        includeXPath: true,
        includeAria: true,
        maxSelectorLength: 100,
        maxAlternatives: 3
      },
      screenshot: {
        enabled: true,
        quality: 80,
        maxWidth: 1920,
        maxHeight: 1080,
        highlightElements: false,
        highlightColor: '#ff0000'
      },
      sensitivity: {
        minStepInterval: 100,
        minScrollAmount: 10,
        recordRapidClicks: false,
        maxTypingDelay: 1000
      },
      optimization: {
        consolidateSteps: true,
        maxConsolidateSteps: 5,
        defaultWaitDuration: 500,
        addIntelligentWaits: true
      },
      ...config
    };
  }

  /**
   * Start recording for a session
   * @param sessionId - Session identifier
   * @param browserId - Browser instance identifier
   */
  public async startRecording(sessionId: string, browserId: string): Promise<void> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Recording already active for session: ${sessionId}`);
    }

    const session: RecordingSession = {
      id: sessionId,
      isRecording: true,
      isPaused: false,
      startedAt: new Date(),
      totalPausedDuration: 0,
      stepCounter: 1,
      currentUrl: '',
      pendingSteps: new Map(),
      actionBuffer: new Map(),
      steps: []
    };

    this.sessions.set(sessionId, session);

    this.emit('recording:started', { sessionId, browserId });
  }

  /**
   * Stop recording for a session
   * @param sessionId - Session identifier
   * @returns Array of recorded steps
   */
  public async stopRecording(sessionId: string): Promise<Step[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No active recording for session: ${sessionId}`);
    }

    session.isRecording = false;

    // Flush any pending steps
    this.flushPendingSteps(session);

    this.emit('recording:stopped', { sessionId });

    return [...session.steps];
  }

  /**
   * Pause recording for a session
   * @param sessionId - Session identifier
   */
  public async pauseRecording(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isRecording) {
      throw new Error(`No active recording for session: ${sessionId}`);
    }

    session.isPaused = true;
    session.pausedAt = new Date();

    // Flush any pending steps
    this.flushPendingSteps(session);

    this.emit('recording:paused', { sessionId });
  }

  /**
   * Resume recording for a session
   * @param sessionId - Session identifier
   */
  public async resumeRecording(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isRecording) {
      throw new Error(`No active recording for session: ${sessionId}`);
    }

    if (session.isPaused && session.pausedAt) {
      session.totalPausedDuration += Date.now() - session.pausedAt.getTime();
    }

    session.isPaused = false;
    session.pausedAt = undefined;

    this.emit('recording:resumed', { sessionId });
  }

  /**
   * Clean up a session
   * @param sessionId - Session identifier
   */
  public async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Stop recording if active
    if (session.isRecording) {
      await this.stopRecording(sessionId);
    }

    // Clean up session data
    session.pendingSteps.clear();
    session.actionBuffer.clear();
    session.steps = [];

    // Remove session
    this.sessions.delete(sessionId);

    this.emit('session:cleaned', { sessionId });
  }

  /**
   * Capture a browser event and convert it to a step
   * @param event - Browser event to capture
   * @param sessionId - Session identifier
   */
  public async captureEvent(event: BrowserEvent, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isRecording || session.isPaused) {
      return;
    }

    // Update current URL
    if (event.url !== session.currentUrl) {
      session.previousUrl = session.currentUrl;
      session.currentUrl = event.url;
    }

    // Check minimum interval
    if (session.lastEventTimestamp) {
      const timeDiff = event.timestamp - session.lastEventTimestamp;
      if (timeDiff < this.config.sensitivity.minStepInterval) {
        return; // Too soon after last event
      }
    }

    session.lastEventTimestamp = event.timestamp;

    // Process the event based on type
    const steps = await this.processEvent(event, session);

    // Add steps to session
    for (const stepData of steps) {
      const step = await this.finalizeStep(session, stepData);
      if (step) {
        session.steps.push(step);
        session.stepCounter++;
        this.emit('step:created', { step, sessionId });
        this.emit('step:captured', sessionId, step);
      }
    }
  }

  /**
   * Get all steps for a session
   * @param sessionId - Session identifier
   * @returns Array of steps
   */
  public getSteps(sessionId: string): Step[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.steps] : [];
  }

  /**
   * Process a browser event and generate step data
   */
  private async processEvent(event: BrowserEvent, session: RecordingSession): Promise<Partial<Step>[]> {
    switch (event.type) {
      case BrowserEventType.CLICK:
        return this.processClick(event, session);

      case BrowserEventType.DOUBLE_CLICK:
        return this.processDoubleClick(event, session);

      case BrowserEventType.CONTEXT_MENU:
        return this.processRightClick(event, session);

      case BrowserEventType.INPUT:
        return this.processInput(event, session);

      case BrowserEventType.SUBMIT:
        return this.processSubmit(event, session);

      case BrowserEventType.SCROLL:
        return this.processScroll(event, session);

      case BrowserEventType.NAVIGATION:
        return this.processNavigation(event, session);

      case BrowserEventType.RESIZE:
        return this.processResize(event, session);

      default:
        return [];
    }
  }

  /**
   * Process click event
   */
  private async processClick(event: BrowserEvent, session: RecordingSession): Promise<Partial<Step>[]> {
    if (!event.target) return [];

    const selector = await this.generateSelectorForElement(event.target);
    const step: Partial<Step> = {
      id: nanoid(),
      sessionId: session.id,
      order: session.stepCounter,
      title: this.generateStepTitle('click', selector, event.data),
      description: `Click on ${selector.tagName || 'element'}`,
      action: {
        type: 'click',
        selector,
        position: event.position
      },
      metadata: this.createMetadata(event),
      replayable: true
    };

    return [step];
  }

  /**
   * Process double click event
   */
  private async processDoubleClick(event: BrowserEvent, session: RecordingSession): Promise<Partial<Step>[]> {
    if (!event.target) return [];

    const selector = await this.generateSelectorForElement(event.target);
    const step: Partial<Step> = {
      id: nanoid(),
      sessionId: session.id,
      order: session.stepCounter,
      title: this.generateStepTitle('double_click', selector, event.data),
      description: `Double click on ${selector.tagName || 'element'}`,
      action: {
        type: 'double_click',
        selector,
        position: event.position
      },
      metadata: this.createMetadata(event),
      replayable: true
    };

    return [step];
  }

  /**
   * Process right click event
   */
  private async processRightClick(event: BrowserEvent, session: RecordingSession): Promise<Partial<Step>[]> {
    if (!event.target) return [];

    const selector = await this.generateSelectorForElement(event.target);
    const step: Partial<Step> = {
      id: nanoid(),
      sessionId: session.id,
      order: session.stepCounter,
      title: this.generateStepTitle('right_click', selector, event.data),
      description: `Right click on ${selector.tagName || 'element'}`,
      action: {
        type: 'right_click',
        selector,
        position: event.position
      },
      metadata: this.createMetadata(event),
      replayable: true
    };

    return [step];
  }

  /**
   * Process input event
   */
  private async processInput(event: BrowserEvent, session: RecordingSession): Promise<Partial<Step>[]> {
    if (!event.target || !event.data?.value) return [];

    const selector = await this.generateSelectorForElement(event.target);
    const value = event.data.value;

    // Check if we should buffer this typing action
    const bufferKey = selector.selector || selector.xpath || '';
    const existing = session.actionBuffer.get(bufferKey);

    if (existing && existing.type === 'type') {
      // Append to existing typing action
      existing.value = (existing.value as string || '') + value;
      return [];
    }

    // Create new typing action
    const step: Partial<Step> = {
      id: nanoid(),
      sessionId: session.id,
      order: session.stepCounter,
      title: this.generateStepTitle('type', selector, { text: value }),
      description: `Type "${value}" into ${selector.tagName || 'field'}`,
      action: {
        type: 'type',
        selector,
        value
      },
      metadata: this.createMetadata(event),
      replayable: true,
      canConsolidate: true
    };

    // Buffer for potential consolidation
    session.actionBuffer.set(bufferKey, step.action);

    return [step];
  }

  /**
   * Process submit event
   */
  private async processSubmit(event: BrowserEvent, session: RecordingSession): Promise<Partial<Step>[]> {
    const selector = await this.generateSelectorForElement(event.target);
    const step: Partial<Step> = {
      id: nanoid(),
      sessionId: session.id,
      order: session.stepCounter,
      title: this.generateStepTitle('submit', selector, event.data),
      description: `Submit ${selector.tagName || 'form'}`,
      action: {
        type: 'submit',
        selector
      },
      metadata: this.createMetadata(event),
      replayable: true
    };

    return [step];
  }

  /**
   * Process scroll event
   */
  private async processScroll(event: BrowserEvent, session: RecordingSession): Promise<Partial<Step>[]> {
    if (!event.scrollPosition) return [];

    // Check if scroll amount is significant
    const scrollAmount = Math.abs(
      (event.scrollPosition.y || 0) - (session.lastScrollY || 0)
    );

    if (scrollAmount < this.config.sensitivity.minScrollAmount) {
      return [];
    }

    session.lastScrollY = event.scrollPosition.y;

    const step: Partial<Step> = {
      id: nanoid(),
      sessionId: session.id,
      order: session.stepCounter,
      title: 'Scroll page',
      description: `Scroll to position (${event.scrollPosition.x}, ${event.scrollPosition.y})`,
      action: {
        type: 'scroll',
        scrollAmount,
        position: event.scrollPosition
      },
      metadata: this.createMetadata(event),
      replayable: true,
      canConsolidate: true
    };

    return [step];
  }

  /**
   * Process navigation event
   */
  private async processNavigation(event: BrowserEvent, session: RecordingSession): Promise<Partial<Step>[]> {
    if (session.previousUrl === event.url) {
      return []; // No actual navigation
    }

    const step: Partial<Step> = {
      id: nanoid(),
      sessionId: session.id,
      order: session.stepCounter,
      title: `Navigate to ${event.url}`,
      description: `Navigate to ${event.pageTitle || event.url}`,
      action: {
        type: 'navigate',
        url: event.url,
        referrer: session.previousUrl
      },
      metadata: this.createMetadata(event),
      replayable: true
    };

    return [step];
  }

  /**
   * Process resize event
   */
  private async processResize(event: BrowserEvent, session: RecordingSession): Promise<Partial<Step>[]> {
    if (!event.viewport) return [];

    const step: Partial<Step> = {
      id: nanoid(),
      sessionId: session.id,
      order: session.stepCounter,
      title: 'Resize window',
      description: `Resize window to ${event.viewport.width}x${event.viewport.height}`,
      action: {
        type: 'resize',
        dimensions: event.viewport
      },
      metadata: this.createMetadata(event),
      replayable: true
    };

    return [step];
  }

  /**
   * Generate selector info for an element
   */
  private async generateSelectorForElement(element: any): Promise<SelectorInfo> {
    if (!element) {
      return { selector: '' };
    }

    try {
      const selectors = generateSelectors(element, this.config.selectorOptions);
      const primary = selectors[0];

      if (!primary) {
        return { selector: '' };
      }

      const alternatives = selectors.slice(1, 3).map(s => s.selector);

      return {
        selector: primary.selector,
        alternatives,
        xpath: primary.metadata?.xpath,
        text: primary.metadata?.attributes?.text,
        attributes: primary.metadata?.attributes,
        tagName: primary.metadata?.attributes?.tagName,
        className: primary.metadata?.attributes?.class,
        id: primary.metadata?.attributes?.id
      };
    } catch (error) {
      console.error('Failed to generate selector:', error);
      return { selector: '' };
    }
  }

  /**
   * Generate human-readable step title
   */
  private generateStepTitle(type: StepType, selector: SelectorInfo, data: any): string {
    const elementType = selector.tagName || 'element';
    const elementText = selector.text || selector.id || selector.className;

    switch (type) {
      case 'click':
        if (elementText) return `Click "${elementText}"`;
        return `Click ${elementType}`;

      case 'double_click':
        if (elementText) return `Double click "${elementText}"`;
        return `Double click ${elementType}`;

      case 'right_click':
        if (elementText) return `Right click "${elementText}"`;
        return `Right click ${elementType}`;

      case 'type':
        const text = data.text || data.value || '';
        if (elementText && text) return `Type "${text}" in "${elementText}"`;
        if (elementText) return `Type in "${elementText}"`;
        return `Type "${text}"`;

      case 'hover':
        if (elementText) return `Hover over "${elementText}"`;
        return `Hover over ${elementType}`;

      case 'drag_and_drop':
        if (elementText) return `Drag and drop to "${elementText}"`;
        return `Drag and drop to ${elementType}`;

      default:
        return `${type.replace('_', ' ').charAt(0).toUpperCase() + type.slice(1)} ${elementType}`;
    }
  }

  /**
   * Create metadata for a step
   */
  private createMetadata(event: BrowserEvent): StepMetadata {
    return {
      timestamp: new Date(event.timestamp).toISOString(),
      url: event.url,
      pageTitle: event.pageTitle,
      viewport: event.viewport || { width: 0, height: 0 },
      scrollPosition: event.scrollPosition || { x: 0, y: 0 },
      zoomLevel: event.devicePixelRatio || 1,
      deviceInfo: {
        userAgent: '',
        platform: '',
        language: ''
      },
      browserInfo: {
        name: '',
        version: ''
      },
      performance: {
        loadTime: 0,
        renderTime: 0
      },
      customData: {}
    };
  }

  /**
   * Finalize a step with all required fields
   */
  private async finalizeStep(session: RecordingSession, stepData: Partial<Step>): Promise<Step | null> {
    // Set required fields
    const step: Step = {
      id: stepData.id || nanoid(),
      sessionId: session.id,
      order: stepData.order || session.stepCounter,
      title: stepData.title || 'Unknown action',
      description: stepData.description,
      action: stepData.action as StepAction,
      metadata: stepData.metadata as StepMetadata,
      replayable: stepData.replayable ?? true,
      favorite: false,
      tags: [],
      validation: {
        enabled: true,
        expectations: []
      }
    };

    // Add screenshot if enabled
    if (this.config.screenshot.enabled) {
      step.screenshot = await this.captureScreenshot(step);
    }

    // Apply post-processors
    let processedStep = step;
    for (const processor of this.stepPostProcessors) {
      processedStep = await processor(processedStep, session) || processedStep;
    }

    return processedStep;
  }

  /**
   * Capture screenshot for a step
   */
  private async captureScreenshot(step: Step): Promise<StepScreenshot | undefined> {
    // This would integrate with your screenshot capture system
    // For now, return undefined
    return undefined;
  }

  /**
   * Flush any pending steps in the session
   */
  private flushPendingSteps(session: RecordingSession): void {
    // Process any actions in the buffer
    for (const [key, action] of session.actionBuffer) {
      if (action.type === 'type') {
        // Create final typing step
        const step: Partial<Step> = {
          id: nanoid(),
          sessionId: session.id,
          order: session.stepCounter,
          title: `Type "${action.value}"`,
          description: `Complete typing into field`,
          action,
          metadata: {
            timestamp: new Date().toISOString(),
            url: session.currentUrl,
            pageTitle: ''
          },
          replayable: true
        };

        this.finalizeStep(session, step).then(finalStep => {
          if (finalStep) {
            session.steps.push(finalStep);
            this.emit('step:created', { step: finalStep, sessionId: session.id });
          }
        });
      }
    }

    session.actionBuffer.clear();
    session.pendingSteps.clear();
  }

  /**
   * Register a step post-processor
   */
  addStepPostProcessor(processor: StepPostProcessor): void {
    this.stepPostProcessors.push(processor);
  }

  /**
   * Register a step validator
   */
  addStepValidator(validator: StepValidator): void {
    this.stepValidators.push(validator);
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): RecordingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Export steps in the specified format
   */
  exportSteps(sessionId: string, format: 'json' | 'stepwise' = 'stepwise'): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (format === 'json') {
      return JSON.stringify({
        session: {
          id: session.id,
          createdAt: session.startedAt.toISOString(),
          stepCount: session.steps.length
        },
        steps: session.steps
      }, null, 2);
    }

    // Export in stepwise format
    const stepwiseFormat = {
      metadata: {
        version: '1.0.0',
        createdAt: session.startedAt.toISOString(),
        duration: Date.now() - session.startedAt.getTime() - session.totalPausedDuration,
        stepCount: session.steps.length
      },
      steps: session.steps.map(step => ({
        id: step.id,
        order: step.order,
        title: step.title,
        description: step.description,
        action: step.action,
        validation: step.validation
      }))
    };

    return JSON.stringify(stepwiseFormat, null, 2);
  }

  /**
   * Clean up old sessions
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();

    for (const [id, session] of this.sessions) {
      const age = now - session.startedAt.getTime();
      if (age > maxAge) {
        this.sessions.delete(id);
      }
    }
  }

  private lastScrollY: number = 0;
}