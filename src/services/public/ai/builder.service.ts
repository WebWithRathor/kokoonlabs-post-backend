import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import logger from '../../../config/logger';
import { aiConfig, aiEnabled } from '../../../config/ai.config';
import { getCatalog } from './catalog';
import { BUILD_TOOL, checkProgram, type Program } from './program';
import { SYSTEM_RULES } from './prompt';
import { fakeAnswer } from './fake';
import { recentHistory } from './history';
import {
  countProject,
  getUsage,
  loadConversation,
  lock,
  refundMessage,
  reserveMessage,
  saveConversation,
  unlock,
  type Conversation,
  type Usage
} from './store';

// What one turn ended with
type TurnResult = 'built' | 'answered' | null;

// How far the chat has got: messages sent / allowed in this AI project
export interface ChatProgress {
  turns: number;
  turnsLimit: number;
}

export type BuildEvent =
  | ({ t: 'meta'; conversationId: string; usage: Usage } & ChatProgress)
  | { t: 'text'; d: string }
  | { t: 'status'; s: 'thinking' | 'building' | 'fixing' }
  | { t: 'program'; program: Program }
  | { t: 'error'; code: string; message: string }
  | ({ t: 'done'; usage: Usage } & ChatProgress);

export interface BuildRequest {
  userId: string;
  conversationId?: string;
  message: string;
  // The canvas as the editor describes it (blocks with ids and values)
  canvas: { blocks?: unknown[]; events?: unknown[] } | null;
  signal?: AbortSignal;
}

// Attempts to get a program that passes the checks (the first + fixes)
const MAX_ATTEMPTS = 3;
const MAX_CANVAS_CHARS = 12_000;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: aiConfig.apiKey }));

/** Every block id in the canvas description. */
const canvasIdsOf = (canvas: BuildRequest['canvas']): Set<string> => {
  const ids = new Set<string>();
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const s = item as Record<string, unknown>;
      if (typeof s?.id === 'string') ids.add(s.id);
      walk(s?.body);
      walk(s?.then);
      walk(s?.else);
      if (Array.isArray(s?.elifs)) for (const e of s.elifs as { body?: unknown }[]) walk(e?.body);
    }
  };
  walk(canvas?.blocks);
  walk(canvas?.events);
  return ids;
};

const canvasText = (canvas: BuildRequest['canvas']) => {
  const blocks = Array.isArray(canvas?.blocks) ? canvas.blocks : [];
  const events = Array.isArray(canvas?.events) ? canvas.events : [];
  if (!blocks.length && !events.length) return 'The canvas is empty.';
  const json = JSON.stringify(events.length ? { steps: blocks, events } : blocks);
  return json.length > MAX_CANVAS_CHARS
    ? `The canvas has a big program (too long to show). Build fresh unless the student asks to keep it.`
    : `Current canvas: ${json}`;
};

/** Thinking is not kept between the student's messages (it can be left out). */
const withoutThinking = (content: Anthropic.ContentBlock[]): Anthropic.ContentBlockParam[] => {
  const kept = content.filter(b => b.type !== 'thinking' && b.type !== 'redacted_thinking') as Anthropic.ContentBlockParam[];
  return kept.length ? kept : [{ type: 'text', text: '(no answer)' }];
};

const errorFor = (err: unknown): { code: string; message: string } => {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401 || err.status === 403) {
      logger.error(`AI builder: the API key was refused (${err.status})`);
      return { code: 'AI_NOT_CONFIGURED', message: 'The AI builder is not set up correctly. Please tell your teacher.' };
    }
    if (err.status === 429 || err.status === 529 || (err.status ?? 0) >= 500) {
      return { code: 'AI_BUSY', message: 'The AI is very busy right now. Please try again in a minute.' };
    }
    logger.error(`AI builder: API error ${err.status}: ${err.message}`);
  } else if (!(err instanceof Error && err.name === 'AbortError')) {
    logger.error(`AI builder: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { code: 'AI_FAILED', message: 'Something went wrong while building. Please try again.' };
};

/**
 * One student message: checks the limits, asks the model, checks its
 * program (letting it fix mistakes) and reports everything through emit.
 */
export const runBuild = async (req: BuildRequest, emit: (e: BuildEvent) => void): Promise<void> => {
  const { userId } = req;
  if (!aiEnabled()) {
    emit({ t: 'error', code: 'AI_NOT_CONFIGURED', message: 'The AI builder is not switched on yet.' });
    return;
  }
  if (!(await lock(userId))) {
    emit({ t: 'error', code: 'AI_BUSY_STUDENT', message: 'The AI is still working on your last message.' });
    return;
  }
  try {
    let conversationId = req.conversationId ?? '';
    let conv = conversationId ? await loadConversation(userId, conversationId) : null;
    if (!conv) {
      conversationId = randomUUID();
      conv = { messages: [], turns: 0 };
    }
    if (conv.turns >= aiConfig.messagesPerProject) {
      emit({
        t: 'error',
        code: 'AI_PROJECT_FULL',
        message: `This AI project has reached ${aiConfig.messagesPerProject} messages. Start a new AI project to keep going.`
      });
      return;
    }
    // A project that hasn't built anything yet needs a free project for today
    const before = await getUsage(userId);
    if (!conv.counted && before.projectsUsed >= before.projectsLimit) {
      emit({
        t: 'error',
        code: 'AI_LIMIT_REACHED',
        message: `You have built ${aiConfig.dailyProjects} AI projects today. Come back tomorrow for more!`
      });
      return;
    }
    if (!(await reserveMessage(userId))) {
      emit({ t: 'error', code: 'AI_LIMIT_REACHED', message: 'You have sent a lot of AI messages today. Come back tomorrow for more!' });
      return;
    }
    emit({ t: 'meta', conversationId, usage: await getUsage(userId), turns: conv.turns, turnsLimit: aiConfig.messagesPerProject });

    let result: TurnResult = null;
    try {
      result = aiConfig.fake ? await fakeTurn(req, conv, emit) : await modelTurn(req, conv, emit);
    } catch (err) {
      emit({ t: 'error', ...errorFor(err) });
    }
    if (result) {
      conv.turns++;
      if (result === 'built' && !conv.counted) {
        conv.counted = true;
        await countProject(userId);
      }
      await saveConversation(userId, conversationId, conv);
    } else {
      await refundMessage(userId);
    }
    emit({ t: 'done', usage: await getUsage(userId), turns: conv.turns, turnsLimit: aiConfig.messagesPerProject });
  } finally {
    await unlock(userId);
  }
};

/**
 * The student's message, after the result of the last build (if any). The
 * canvas goes with the message being answered; the saved copy leaves it out
 * (every new message brings the canvas as it is then).
 */
const studentMessage = (req: BuildRequest, conv: Conversation, withCanvas: boolean): Anthropic.MessageParam => {
  const content: Anthropic.ContentBlockParam[] = [];
  if (conv.pendingToolUseId) {
    content.push({ type: 'tool_result', tool_use_id: conv.pendingToolUseId, content: 'Built on the student\'s canvas.' });
  }
  content.push({ type: 'text', text: withCanvas ? `${canvasText(req.canvas)}\n\nStudent: ${req.message}` : `Student: ${req.message}` });
  return { role: 'user', content };
};


const modelTurn = async (req: BuildRequest, conv: Conversation, emit: (e: BuildEvent) => void): Promise<TurnResult> => {
  const catalog = await getCatalog();
  const canvasIds = canvasIdsOf(req.canvas);
  // This turn's messages, kept in full while the model fixes its program
  const turn: Anthropic.MessageParam[] = [studentMessage(req, conv, true)];
  // Kept for the conversation (no thinking, no canvas)
  const saved: Anthropic.MessageParam[] = [studentMessage(req, conv, false)];
  const history = recentHistory(conv.messages);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    emit({ t: 'status', s: attempt === 0 ? 'thinking' : 'fixing' });
    const stream = getClient().messages.stream(
      {
        model: aiConfig.model,
        max_tokens: 16_000,
        thinking: { type: 'adaptive' },
        output_config: { effort: aiConfig.effort },
        // Caches the conversation so far; the system block below is cached on its own
        cache_control: { type: 'ephemeral' },
        system: [{ type: 'text', text: `${SYSTEM_RULES}\n${catalog.text}`, cache_control: { type: 'ephemeral' } }],
        tools: [BUILD_TOOL as unknown as Anthropic.Tool],
        messages: [...history, ...turn]
      },
      { signal: req.signal }
    );
    stream.on('streamEvent', event => {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && attempt === 0) {
        emit({ t: 'text', d: event.delta.text });
      } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        emit({ t: 'status', s: 'building' });
      }
    });
    const message = await stream.finalMessage();
    const u = message.usage;
    logger.info(
      `AI builder usage user=${req.userId} model=${aiConfig.model} attempt=${attempt} in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens} stop=${message.stop_reason}`
    );

    if (message.stop_reason === 'refusal') {
      emit({ t: 'error', code: 'AI_REFUSED', message: "I can't help with that one. Try asking for a different project!" });
      return null;
    }
    const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) {
      // A plain answer (a question about the project)
      saved.push({ role: 'assistant', content: withoutThinking(message.content) });
      conv.messages.push(...saved);
      conv.pendingToolUseId = undefined;
      return 'answered';
    }
    if (message.stop_reason === 'max_tokens') {
      emit({ t: 'error', code: 'AI_TOO_BIG', message: 'That project got too big for me. Try asking for a smaller one.' });
      return null;
    }
    const { program, errors } = checkProgram(toolUse.input, catalog, canvasIds);
    if (program) {
      emit({ t: 'program', program });
      saved.push({ role: 'assistant', content: withoutThinking(message.content) });
      conv.messages.push(...saved);
      conv.pendingToolUseId = toolUse.id;
      return 'built';
    }
    logger.info(`AI builder: program refused (attempt ${attempt}): ${errors.join(' | ')}`);
    const fix: Anthropic.MessageParam = {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: `Fix these problems and call build_project again:\n- ${errors.join('\n- ')}` }]
    };
    turn.push({ role: 'assistant', content: message.content as Anthropic.ContentBlockParam[] }, fix);
    saved.push({ role: 'assistant', content: withoutThinking(message.content) }, fix);
  }
  emit({ t: 'error', code: 'AI_FAILED', message: "I couldn't get that project right. Try describing it a little differently." });
  return null;
};

const fakeTurn = async (req: BuildRequest, conv: Conversation, emit: (e: BuildEvent) => void): Promise<TurnResult> => {
  emit({ t: 'status', s: 'thinking' });
  const { text, program } = fakeAnswer(req.message);
  for (const word of text.split(/(?<= )/)) {
    if (req.signal?.aborted) return null;
    emit({ t: 'text', d: word });
    await new Promise(r => setTimeout(r, 40));
  }
  if (program) {
    emit({ t: 'status', s: 'building' });
    await new Promise(r => setTimeout(r, 600));
    const catalog = await getCatalog();
    const checked = checkProgram(program, catalog, canvasIdsOf(req.canvas));
    if (!checked.program) {
      emit({ t: 'error', code: 'AI_FAILED', message: `Practice program failed its checks: ${checked.errors.join('; ')}` });
      return null;
    }
    emit({ t: 'program', program: checked.program });
  }
  conv.messages.push({ role: 'user', content: req.message }, { role: 'assistant', content: text });
  return program ? 'built' : 'answered';
};
