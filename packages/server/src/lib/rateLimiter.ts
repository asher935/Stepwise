/**
 * Rate limiting utilities for WebSocket connections
 *
 * Provides token bucket rate limiting to prevent abuse of WebSocket connections
 */

export interface RateLimitResult {
  allowed: boolean;
  tokensRemaining: number;
  resetTime: Date;
}

export class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private lastRefill: Date;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = new Date();
  }

  consume(tokens: number = 1): RateLimitResult {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return {
        allowed: true,
        tokensRemaining: this.tokens,
        resetTime: new Date(Date.now() + (tokens * 1000) / this.refillRate)
      };
    }

    return {
      allowed: false,
      tokensRemaining: this.tokens,
      resetTime: new Date(Date.now() + ((tokens - this.tokens) * 1000) / this.refillRate)
    };
  }

  private refill(): void {
    const now = new Date();
    const timeDiff = (now.getTime() - this.lastRefill.getTime()) / 1000;
    const tokensToAdd = timeDiff * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

export const rateLimiter = {
  tokens: new Map<string, TokenBucket>(),

  getBucket(key: string, maxTokens: number, refillRate: number): TokenBucket {
    if (!this.tokens.has(key)) {
      this.tokens.set(key, new TokenBucket(maxTokens, refillRate));
    }
    return this.tokens.get(key)!;
  },

  checkLimit(
    key: string,
    maxTokens: number,
    refillRate: number,
    tokensToConsume: number = 1
  ): RateLimitResult {
    const bucket = this.getBucket(key, maxTokens, refillRate);
    return bucket.consume(tokensToConsume);
  },

  clear(key?: string): void {
    if (key) {
      this.tokens.delete(key);
    } else {
      this.tokens.clear();
    }
  }
};