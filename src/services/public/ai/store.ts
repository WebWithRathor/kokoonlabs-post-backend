import type Anthropic from '@anthropic-ai/sdk';
import { redis } from '../../../utils/redis';
import { istDay } from '../../../utils/ist-date';
import { aiConfig } from '../../../config/ai.config';

// Per-student limits and AI conversations, kept in Redis.
//   KL:AI:DAY:<user>:<day>    projects / messages used that IST day
//   KL:AI:CONV:<user>:<id>    one AI project's conversation (7 days)
//   KL:AI:LOCK:<user>         one build at a time per student

const DAY_TTL = 2 * 24 * 60 * 60;
// An AI project's chat is kept a week after its last message
const CONV_TTL = 7 * 24 * 60 * 60;
const LOCK_TTL = 3 * 60;

const dayKey = (userId: string) => `KL:AI:DAY:${userId}:${istDay()}`;
const convKey = (userId: string, id: string) => `KL:AI:CONV:${userId}:${id}`;
const lockKey = (userId: string) => `KL:AI:LOCK:${userId}`;

export interface Usage {
  projectsUsed: number;
  projectsLimit: number;
  messagesUsed: number;
  messagesLimit: number;
}

export const getUsage = async (userId: string): Promise<Usage> => {
  const day = await redis.hgetall(dayKey(userId));
  return {
    projectsUsed: Number(day.projects ?? 0),
    projectsLimit: aiConfig.dailyProjects,
    messagesUsed: Number(day.messages ?? 0),
    messagesLimit: aiConfig.dailyMessages
  };
};

/** Counts this message. false: the day's message limit is reached. */
export const reserveMessage = async (userId: string): Promise<boolean> => {
  const key = dayKey(userId);
  const [[, messages]] = (await redis.multi().hincrby(key, 'messages', 1).expire(key, DAY_TTL).exec()) as [[null, number], unknown];
  if (messages <= aiConfig.dailyMessages) return true;
  await refundMessage(userId);
  return false;
};

/** Gives back a message that never got an answer. */
export const refundMessage = async (userId: string) => {
  await redis.hincrby(dayKey(userId), 'messages', -1);
};

/** An AI project counts once, when the AI first builds something in it. */
export const countProject = async (userId: string) => {
  const key = dayKey(userId);
  await redis.multi().hincrby(key, 'projects', 1).expire(key, DAY_TTL).exec();
};

export const lock = async (userId: string) => (await redis.set(lockKey(userId), '1', 'EX', LOCK_TTL, 'NX')) === 'OK';
export const unlock = async (userId: string) => {
  await redis.del(lockKey(userId));
};

export interface Conversation {
  messages: Anthropic.MessageParam[];
  // Student messages so far
  turns: number;
  // A tool call waiting for its result, given with the next message
  pendingToolUseId?: string;
  // Counted as one of today's projects (it built something)
  counted?: boolean;
}

export const loadConversation = async (userId: string, id: string): Promise<Conversation | null> => {
  const raw = await redis.get(convKey(userId, id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Conversation;
  } catch {
    return null;
  }
};

export const saveConversation = async (userId: string, id: string, conv: Conversation) => {
  await redis.set(convKey(userId, id), JSON.stringify(conv), 'EX', CONV_TTL);
};
