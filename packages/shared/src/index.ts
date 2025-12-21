/**
 * Stepwise Shared Package
 *
 * This package contains shared types, utilities, and constants
 * used across the Stepwise monorepo.
 */

// Export core interfaces that will be shared across packages
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Export shared API version
export const API_VERSION = 'v1' as const;

// ================================
// Session-related exports
// ================================

// Export all session-related types, interfaces, enums, and utilities
export * from './session';

// ================================
// Step-related exports
// ================================

// Export all step-related types, interfaces, enums, and utilities
export * from './step';

// ================================
// Constants exports
// ================================

// Export all constants
export * from './constants';

// ================================
// WebSocket message types
// ================================

// Export all WebSocket-related types, interfaces, enums, and utilities
export * from './ws';

// ================================
// Future exports (ready for when these modules are created)
// ================================

// Export/Import types
export * from './export';

// Utility functions and type guards (will export from './utils' when created)
// export * from './utils';