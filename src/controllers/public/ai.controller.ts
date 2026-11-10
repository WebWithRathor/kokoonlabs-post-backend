import { Request, Response } from 'express';
import asyncHandler from '../../utils/async-handler';
import ResponseHandler from '../../utils/response-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import { aiConfig, aiEnabled } from '../../config/ai.config';
import { getUsage } from '../../services/public/ai/store';
import { runBuild, type BuildEvent } from '../../services/public/ai/builder.service';
import { getProfiles } from '../../services/private/ai-profile.service';
import { listComponents, partsByBlock } from '../../services/private/component.service';

const userIdOf = (req: Request): string => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.INVALID_TOKEN);
  return String(req.user._id);
};

/** What the student has left today, and whether the builder is on. */
export const getAiUsage = asyncHandler(async (req: Request, res: Response) => {
  const usage = await getUsage(userIdOf(req));
  ResponseHandler.success(
    { enabled: aiEnabled(), practice: aiConfig.fake, messagesPerProject: aiConfig.messagesPerProject, usage },
    'AI usage'
  ).send(res);
});

/**
 * For the editor's wiring and Hardware tab: the part behind each hardware
 * block (from Admin > Components, else what an admin taught the AI), and
 * the kit's components for the "Add a part" list.
 */
export const getAiParts = asyncHandler(async (_req: Request, res: Response) => {
  const fromComponents = await partsByBlock();
  const parts = [
    ...(await getProfiles()).filter(p => p.part && !fromComponents.has(p.blockType)).map(p => ({ blockType: p.blockType, part: p.part })),
    ...[...fromComponents.entries()].map(([blockType, part]) => ({ blockType, part }))
  ];
  const components = (await listComponents()).map(c => ({
    key: c.key,
    name: c.name,
    art: c.art,
    category: c.category,
    blocks: [...new Set(c.links.map(l => l.blockType))]
  }));
  ResponseHandler.success({ parts, components }, 'AI parts').send(res);
});

/**
 * Streams the build as newline-separated JSON events (BuildEvent): text as
 * the AI writes it, then the checked program, then "done".
 */
export const buildWithAi = asyncHandler(async (req: Request, res: Response) => {
  const userId = userIdOf(req);
  const abort = new AbortController();
  // The student closed the panel or the page: stop paying for the answer
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  // Proxies (nginx) must pass each line on at once
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (e: BuildEvent) => {
    if (res.writableEnded) return;
    res.write(`${JSON.stringify(e)}\n`);
    // compression() holds output back until flushed
    (res as Response & { flush?: () => void }).flush?.();
  };

  await runBuild(
    {
      userId,
      message: String(req.body.message),
      conversationId: req.body.conversationId || undefined,
      canvas: req.body.canvas ?? null,
      signal: abort.signal
    },
    emit
  );
  res.end();
});
