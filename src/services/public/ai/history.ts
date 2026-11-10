import type Anthropic from '@anthropic-ai/sdk';

// Earlier messages the model sees (the newest; the current canvas is always sent)
export const HISTORY_MESSAGES = 24;

/**
 * The newest part of a long chat. It starts at a student message, without
 * results of tool calls that were cut off.
 */
export const recentHistory = (messages: Anthropic.MessageParam[], max = HISTORY_MESSAGES): Anthropic.MessageParam[] => {
  let start = Math.max(0, messages.length - max);
  while (start < messages.length) {
    const m = messages[start];
    if (m.role === 'user') {
      const content = typeof m.content === 'string' ? m.content : m.content.filter(b => b.type !== 'tool_result');
      if (typeof content === 'string' || content.length) {
        return [{ role: 'user', content }, ...messages.slice(start + 1)];
      }
    }
    start++;
  }
  return [];
};
