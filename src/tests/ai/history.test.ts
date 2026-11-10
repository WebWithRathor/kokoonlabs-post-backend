import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { recentHistory } from '../../services/public/ai/history';

const user = (text: string, toolResultFor?: string): Anthropic.MessageParam => ({
  role: 'user',
  content: [
    ...(toolResultFor ? [{ type: 'tool_result' as const, tool_use_id: toolResultFor, content: 'Built' }] : []),
    { type: 'text' as const, text }
  ]
});
const built = (id: string): Anthropic.MessageParam => ({
  role: 'assistant',
  content: [{ type: 'tool_use', id, name: 'build_project', input: {} }]
});

test('a long chat keeps its newest messages and starts cleanly', () => {
  const chat: Anthropic.MessageParam[] = [];
  for (let i = 0; i < 20; i++) chat.push(user(`m${i}`, i ? `t${i - 1}` : undefined), built(`t${i}`));
  const recent = recentHistory(chat, 7);
  assert.equal(recent[0].role, 'user');
  // The tool result whose call was cut off is gone, the text stays
  assert.deepEqual(recent[0].content, [{ type: 'text', text: 'm17' }]);
  assert.equal(recent.length, 6);
  assert.deepEqual(recentHistory(chat.slice(0, 4), 24), chat.slice(0, 4));
});
