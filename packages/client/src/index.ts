console.log('Stepwise Client initialized');

export { WSClient, createWSClient } from './lib/ws.js';
export type { 
  WSMessageHandler, 
  WSErrorHandler, 
  WSOpenHandler, 
  WSCloseHandler, 
  WSStateChangeHandler 
} from './lib/ws.js';

export const VERSION = '0.1.0';