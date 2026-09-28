// =====================================================================
// Gamification — one place for every number and name students see.
// Audience: 13–15. Every effort earns something; nothing reads as a penalty.
// =====================================================================

// ---------------------------------------------------------------------
// XP amounts
// ---------------------------------------------------------------------
export const XP = {
  CONTENT_VIDEO: 5,
  CONTENT_NOTE: 5,
  MCQ_FULLY_CORRECT: 5,
  MCQ_PARTLY_CORRECT: 2,     // best score > 0 but not fully correct
  MCQ_NO_CORRECT: 0,
  SUB_MODULE_COMPLETE: 20,
  MODULE_COMPLETE: 50
} as const;

// Early-finish bonus, on top of SUB_MODULE_COMPLETE
export const EARLY_BONUS = [
  { daysEarly: 7, xp: 30 },
  { daysEarly: 5, xp: 20 },
  { daysEarly: 3, xp: 10 }
] as const;

export const bonusForDaysEarly = (daysEarly: number): number =>
  EARLY_BONUS.find((b) => daysEarly >= b.daysEarly)?.xp ?? 0;

// Highest bonus a sub-module can give, from its deadline length
export const maxBonusForDeadline = (deadlineDays: number | null): number =>
  deadlineDays ? bonusForDaysEarly(deadlineDays) : 0;

export function contentXp(
  contentType: 'video' | 'note' | 'mcq',
  mcqBestScore?: number        // 0..1
): number {
  if (contentType === 'video') return XP.CONTENT_VIDEO;
  if (contentType === 'note') return XP.CONTENT_NOTE;
  if (!mcqBestScore) return XP.MCQ_NO_CORRECT;
  return mcqBestScore >= 1 ? XP.MCQ_FULLY_CORRECT : XP.MCQ_PARTLY_CORRECT;
}

// ---------------------------------------------------------------------
// Levels: level n needs 25n² + 75n total XP (100, 250, 450, 700, ...)
// ---------------------------------------------------------------------
export const xpForLevel = (n: number): number => 25 * n * n + 75 * n;
export const levelFromXp = (xp: number): number =>
  Math.floor((-75 + Math.sqrt(5625 + 100 * Math.max(0, xp))) / 50);

// ---------------------------------------------------------------------
// Ranks (a named title over a band of levels)
// ---------------------------------------------------------------------
export interface Rank {
  key: string;
  name: string;
  emoji: string;
  fromLevel: number;
}

export const RANKS: Rank[] = [
  { key: 'rookie',    name: 'Rookie',    emoji: '🌱', fromLevel: 0 },
  { key: 'explorer',  name: 'Explorer',  emoji: '🧭', fromLevel: 2 },
  { key: 'builder',   name: 'Builder',   emoji: '🔨', fromLevel: 4 },
  { key: 'creator',   name: 'Creator',   emoji: '🎨', fromLevel: 6 },
  { key: 'innovator', name: 'Innovator', emoji: '💡', fromLevel: 8 },
  { key: 'pro',       name: 'Pro',       emoji: '⚡', fromLevel: 11 },
  { key: 'master',    name: 'Master',    emoji: '🏆', fromLevel: 15 },
  { key: 'legend',    name: 'Legend',    emoji: '👑', fromLevel: 20 }
];

export const rankForLevel = (level: number): Rank =>
  [...RANKS].reverse().find((r) => level >= r.fromLevel) ?? RANKS[0];

// Everything the profile / header needs, e.g. "🔨 Builder · Level 5", bar 40%
export function levelCard(totalXp: number) {
  const level = levelFromXp(totalXp);
  const rank = rankForLevel(level);
  const nextRank = RANKS.find((r) => r.fromLevel > level) ?? null;
  const floor = level === 0 ? 0 : xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return {
    level,
    rank,
    nextRank,
    totalXp,
    xpIntoLevel: totalXp - floor,
    xpForNextLevel: ceil - floor,
    xpToNextLevel: ceil - totalXp,
    percentToNextLevel: Math.round(((totalXp - floor) / (ceil - floor)) * 100),
    label: `${rank.emoji} ${rank.name} · Level ${level}`
  };
}

// ---------------------------------------------------------------------
// Names shown in the UI
// ---------------------------------------------------------------------
export const NAMES = {
  xp: 'XP',
  streak: '🔥 Streak',
  globalChallenge: 'Skill Challenge',
  courseChallenge: 'Bonus Mission',
  projects: 'My Showcase',
  certificate: {
    progress: 'Certificate of Completion',
    excellence: 'Certificate of Excellence'
  }
} as const;

// ---------------------------------------------------------------------
// Encouraging copy — never "failed", "rejected", "late" or "lost"
// ---------------------------------------------------------------------
export const COPY = {
  moduleLocked: '🔒 Finish a module to unlock',
  mcqWrong: (triesLeft: number) =>
    `Not quite! ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left`,
  mcqPartly: (triesLeft: number) =>
    `So close, you got part of it! ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left`,
  mcqCorrect: (xp: number) => `Nailed it! +${xp} XP`,
  mcqOutOfTries: "Done! Here's how it works 👇",
  projectNeedsChanges: (triesLeft: number) =>
    `Almost there! Your mentor left some tips. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left`,
  projectApproved: (xp: number) => `Your project was approved! +${xp} XP 🎉`,
  deadlineHint: (dateLabel: string, bonusXp: number) =>
    `Finish by ${dateLabel} for a +${bonusXp} XP bonus`,
  // Past the bonus date: show nothing about deadlines at all
  streakStartNew: (best: number) =>
    `Start a new streak today 🔥${best > 0 ? ` (best: ${best} days)` : ''}`,
  levelUp: (level: number) => `Level up! You're now Level ${level} 🚀`,
  rankUp: (rank: Rank) => `New rank unlocked: ${rank.emoji} ${rank.name}!`,
  badgeEarned: (name: string) => `Badge earned: ${name} 🏅`,
  moduleComplete: (title: string, xp: number) => `Module complete: ${title}! +${xp} XP`,
  certificateEarned: (name: string) => `You earned your ${name}! 🎓`
};
