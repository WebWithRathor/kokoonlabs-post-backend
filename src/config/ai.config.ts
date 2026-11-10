import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Same .env as config.ts (whichever module is imported first loads it)
dotenvConfig({ quiet: true });

// AI project builder (the "describe a project" bar in the editor).
//
//   ANTHROPIC_API_KEY         Claude API key. Without it the builder answers "not set up yet".
//   AI_MODEL                  Model id, e.g. claude-sonnet-5-5 (default) or claude-haiku-5-5
//   AI_EFFORT                 low | medium | high: how hard the model thinks (default low)
//   AI_DAILY_PROJECTS         New AI projects a student can start per day (IST), default 10
//   AI_MESSAGES_PER_PROJECT   Messages a student can send in one AI project (one chat), default 30
//   AI_DAILY_MESSAGES         Safety cap on all AI messages per student per day, default 60
//   AI_FAKE                   "true": canned answers, no API calls (development only)

const bool = z
  .string()
  .optional()
  .transform(v => v === 'true' || v === '1');

const schema = z.object({
  apiKey: z.string().trim().optional().default(''),
  model: z.string().trim().min(1).default('claude-sonnet-5-5'),
  effort: z.enum(['low', 'medium', 'high']).default('low'),
  dailyProjects: z.coerce.number().int().min(0).default(10),
  messagesPerProject: z.coerce.number().int().min(1).default(30),
  dailyMessages: z.coerce.number().int().min(1).default(60),
  fake: bool
});

const parsed = schema.parse({
  apiKey: process.env.ANTHROPIC_API_KEY || undefined,
  model: process.env.AI_MODEL || undefined,
  effort: process.env.AI_EFFORT || undefined,
  dailyProjects: process.env.AI_DAILY_PROJECTS || undefined,
  messagesPerProject: process.env.AI_MESSAGES_PER_PROJECT || undefined,
  dailyMessages: process.env.AI_DAILY_MESSAGES || undefined,
  fake: process.env.AI_FAKE
});

// Canned answers never run in production, whatever the env says
const fake = parsed.fake && process.env.NODE_ENV !== 'production';

export const aiConfig = Object.freeze({ ...parsed, fake });

/** The builder can answer: a key is set, or canned answers in development. */
export const aiEnabled = () => aiConfig.fake || aiConfig.apiKey.length > 0;
