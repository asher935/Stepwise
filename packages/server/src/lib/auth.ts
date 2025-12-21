/**
 * Authentication utilities for WebSocket connections
 *
 * Provides JWT token validation and user authentication for WebSocket connections
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';

export interface AuthResult {
  success: boolean;
  userId?: string;
  reason?: string;
}

export interface JWTPayload {
  userId: string;
  sessionId?: string;
  exp: number;
  iat: number;
}

/**
 * Simple token-based authentication
 * In production, this should integrate with proper JWT validation
 */
export async function authenticateToken(token: string): Promise<AuthResult> {
  try {
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace(/^Bearer\s+/, '');

    // For development, accept any token that looks valid
    // In production, implement proper JWT validation here
    if (process.env['NODE_ENV'] === 'development' && cleanToken === 'dev-token') {
      return {
        success: true,
        userId: 'dev-user'
      };
    }

    // TODO: Implement proper JWT validation
    // const payload = verifyJWT(cleanToken);
    // return { success: true, userId: payload.userId };

    // For now, validate against a simple format
    if (cleanToken.length < 10) {
      return {
        success: false,
        reason: 'Invalid token format'
      };
    }

    // Generate a deterministic user ID from token for demo purposes
    const hash = createHash('sha256').update(cleanToken).digest('hex');
    const userId = `user-${hash.substring(0, 8)}`;

    return {
      success: true,
      userId
    };

  } catch (error) {
    logger.error('Authentication error', { error });
    return {
      success: false,
      reason: 'Authentication failed'
    };
  }
}

/**
 * Generate a session token for a user
 */
export function generateSessionToken(userId: string, expiresIn: number = 3600): string {
  // TODO: Implement proper JWT signing
  // For now, return a simple token
  const timestamp = Date.now();
  const payload = `${userId}:${timestamp}:${expiresIn}`;
  const hash = createHash('sha256').update(payload).digest('hex');
  return `sess-${hash.substring(0, 32)}`;
}

/**
 * Verify a session token
 */
export async function verifySessionToken(token: string): Promise<AuthResult> {
  // TODO: Implement proper JWT verification
  // For now, just check format
  if (!token.startsWith('sess-') || token.length < 10) {
    return {
      success: false,
      reason: 'Invalid session token'
    };
  }

  // Extract user ID from token for demo
  const hash = createHash('sha256').update(token).digest('hex');
  const userId = `user-${hash.substring(0, 8)}`;

  return {
    success: true,
    userId
  };
}