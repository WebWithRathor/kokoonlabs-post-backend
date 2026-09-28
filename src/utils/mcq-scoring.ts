export interface McqOption {
  text: string;
  isCorrect: boolean;
}

export interface McqScore {
  fraction: number;   // 0..1
  isFullyCorrect: boolean;
}

/**
 * Score one attempt.
 * - single:   1 if the correct option is picked, else 0
 * - multiple: (correct picked - wrong picked) / total correct, floored at 0.
 *   Wrong picks cancel right ones, so "select everything" scores 0.
 */
export function scoreMcq(
  options: McqOption[],
  selected: number[],
  selectionType: 'single' | 'multiple'
): McqScore {
  const picks = [...new Set(selected)].filter((i) => i >= 0 && i < options.length);

  if (selectionType === 'single') {
    const ok = picks.length === 1 && options[picks[0]].isCorrect;
    return { fraction: ok ? 1 : 0, isFullyCorrect: ok };
  }

  const totalCorrect = options.filter((o) => o.isCorrect).length;
  const right = picks.filter((i) => options[i].isCorrect).length;
  const wrong = picks.length - right;
  const fraction = Math.max(0, (right - wrong) / totalCorrect);
  return { fraction, isFullyCorrect: right === totalCorrect && wrong === 0 };
}

/** Done when fully correct once, or all attempts used */
export const isMcqDone = (attempts: McqScore[], maxAttempts: number): boolean =>
  attempts.some((a) => a.isFullyCorrect) || attempts.length >= maxAttempts;

/**
 * Progress points: an MCQ gives its full points once it is done (fully
 * correct OR attempts used up), so 100% progress = every item done.
 * How well it went is rewarded in XP instead (see contentXp in the config).
 */
export const mcqProgressPoints = (done: boolean, points: number): number => (done ? points : 0);
