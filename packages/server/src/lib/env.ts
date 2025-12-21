import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

// Environment variable schema with validation
const envSchema = z.object({
  // Server Configuration
  PORT: z.coerce.number()
    .min(1000, 'Port must be at least 1000')
    .max(65535, 'Port cannot exceed 65535')
    .default(3000),

  MAX_SESSIONS: z.coerce.number()
    .min(1, 'Max sessions must be at least 1')
    .max(100, 'Max sessions cannot exceed 100')
    .default(5),

  IDLE_TIMEOUT_MS: z.coerce.number()
    .min(30000, 'Idle timeout must be at least 30 seconds')
    .max(3600000, 'Idle timeout cannot exceed 1 hour')
    .default(1800000),

  MAX_STEPS_PER_SESSION: z.coerce.number()
    .min(1, 'Max steps per session must be at least 1')
    .max(1000, 'Max steps per session cannot exceed 1000')
    .default(200),

  CLEANUP_INTERVAL_MS: z.coerce.number()
    .min(60000, 'Cleanup interval must be at least 1 minute')
    .max(3600000, 'Cleanup interval cannot exceed 1 hour')
    .default(300000),

  SESSION_TOKEN_EXPIRATION_MS: z.coerce.number()
    .min(300000, 'Session token expiration must be at least 5 minutes')
    .max(86400000, 'Session token expiration cannot exceed 24 hours')
    .default(86400000),

  // Browser Configuration
  BROWSER_VIEWPORT_WIDTH: z.coerce.number()
    .min(640, 'Viewport width must be at least 640px')
    .max(2560, 'Viewport width cannot exceed 2560px')
    .default(1280),

  BROWSER_VIEWPORT_HEIGHT: z.coerce.number()
    .min(480, 'Viewport height must be at least 480px')
    .max(1440, 'Viewport height cannot exceed 1440px')
    .default(800),

  SCREENCAST_QUALITY: z.coerce.number()
    .min(10, 'Screencast quality must be at least 10')
    .max(100, 'Screencast quality cannot exceed 100')
    .default(80),

  SCREENCAST_MAX_FPS: z.coerce.number()
    .min(1, 'Screencast FPS must be at least 1')
    .max(60, 'Screencast FPS cannot exceed 60')
    .default(15),

  // Security Configuration
  SESSION_TOKEN_BYTES: z.coerce.number()
    .min(16, 'Session token bytes must be at least 16')
    .max(64, 'Session token bytes cannot exceed 64')
    .default(32),

  // Optional environment variables
  NODE_ENV: z.enum(['development', 'production', 'test'])
    .default('development'),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug'])
    .default('info'),
});

// Type inference from the schema
type EnvConfig = z.infer<typeof envSchema>;

// Validate and parse environment variables
function validateEnv(): EnvConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Environment validation failed:');
      error.errors.forEach((err: any) => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\nPlease check your .env file or environment variables.');
    } else {
      console.error('Unexpected error during environment validation:', error);
    }
    process.exit(1);
  }
}

// Export singleton environment configuration
export const env = validateEnv();

// Export the type for use in other modules
export type { EnvConfig };

// Helper function to get environment variable with type safety
export function getEnvVar<T extends keyof EnvConfig>(key: T): EnvConfig[T] {
  return env[key];
}

// Export a subset of configuration for specific modules
export const serverConfig = {
  port: env.PORT,
  maxSessions: env.MAX_SESSIONS,
  idleTimeoutMs: env.IDLE_TIMEOUT_MS,
  cleanupIntervalMs: env.CLEANUP_INTERVAL_MS,
  sessionTokenExpirationMs: env.SESSION_TOKEN_EXPIRATION_MS,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  browserViewportWidth: env.BROWSER_VIEWPORT_WIDTH,
  browserViewportHeight: env.BROWSER_VIEWPORT_HEIGHT,
  screencastQuality: env.SCREENCAST_QUALITY,
  screencastMaxFps: env.SCREENCAST_MAX_FPS,
  maxStepsPerSession: env.MAX_STEPS_PER_SESSION
};

export const browserConfig = {
  viewport: {
    width: env.BROWSER_VIEWPORT_WIDTH,
    height: env.BROWSER_VIEWPORT_HEIGHT
  },
  screencast: {
    quality: env.SCREENCAST_QUALITY,
    maxFps: env.SCREENCAST_MAX_FPS
  }
};

export const securityConfig = {
  sessionTokenBytes: env.SESSION_TOKEN_BYTES,
  sessionTokenExpirationMs: env.SESSION_TOKEN_EXPIRATION_MS
};

export const loggingConfig = {
  level: env.LOG_LEVEL,
  nodeEnv: env.NODE_ENV
};