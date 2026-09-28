import { Types } from 'mongoose';
import LmsChallengeDao from '../../dao/lms-challenge.dao';
import LmsRewardsDao from '../../dao/lms-rewards.dao';
import BellDao from '../../dao/bell.dao';
import ErrorHandler from '../../utils/error-handler';
import logger from '../../config/logger';
import { IChallenge } from '../../interfaces/lms-rewards.interface';
import { IAnnouncement } from '../../interfaces/announcement.interface';
import { INotification } from '../../interfaces/lms-rewards.interface';
import { pagination } from '../../interfaces/common.interface';

type Id = Types.ObjectId | string;
const FANOUT_BATCH = 500;

const pick = <T extends object>(data: T, keys: string[]): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (data as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
};

const CHALLENGE_FIELDS = [
  'type', 'title', 'description', 'instructions', 'maxXp', 'maxResubmissions',
  'skill', 'requiredLevel', 'course', 'unlockAfterSubModule', 'isActive'
];

// Tells every student who already qualifies about a new Skill Challenge.
// Runs in the background in batches; dedupeKey makes a re-run harmless.
const announceSkillChallenge = (challenge: IChallenge): void => {
  if (challenge.type !== 'global' || !challenge.isActive || !challenge.skill) return;
  void (async () => {
    const cursor = LmsChallengeDao.skillHoldersCursor(challenge.skill as Id, challenge.requiredLevel ?? 1);
    let batch: Partial<INotification>[] = [];
    let sent = 0;
    for await (const stats of cursor) {
      batch.push({
        user: stats.user,
        type: 'new_global_challenge',
        title: `New Skill Challenge: ${challenge.title}`,
        body: `Earn up to ${challenge.maxXp} XP`,
        data: { challengeId: String(challenge._id) },
        link: `/challenges/${challenge._id}`,
        dedupeKey: `new_global:${challenge._id}`
      });
      if (batch.length >= FANOUT_BATCH) {
        await LmsRewardsDao.notifyOnce(batch);
        sent += batch.length;
        batch = [];
      }
    }
    await LmsRewardsDao.notifyOnce(batch);
    sent += batch.length;
    logger.info(`Skill Challenge ${challenge._id}: notified ${sent} students`);
  })().catch(err => logger.error('Skill Challenge notification failed', { err }));
};

// ---------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------
export const createChallenge = async (data: Partial<IChallenge>, adminId: Id) => {
  const challenge = await LmsChallengeDao.createChallenge({
    ...pick(data, CHALLENGE_FIELDS),
    createdBy: new Types.ObjectId(String(adminId))
  });
  announceSkillChallenge(challenge);
  return challenge;
};

export const updateChallenge = async (id: string, data: Partial<IChallenge>) => {
  const before = await LmsChallengeDao.findChallenge(id);
  if (!before) throw new ErrorHandler(404, 'Challenge not found');
  const after = await LmsChallengeDao.updateChallenge(id, pick(data, CHALLENGE_FIELDS));
  if (!after) throw new ErrorHandler(404, 'Challenge not found');
  if (!before.isActive && after.isActive) announceSkillChallenge(after); // just opened
  return after;
};

export const listChallenges = async (
  filters: { type?: string; courseId?: string; isActive?: boolean },
  page: { page: number; limit: number; skip: number }
): Promise<{ challenges: IChallenge[]; pagination: pagination }> => {
  const filter: Record<string, unknown> = {};
  if (filters.type) filter.type = filters.type;
  if (filters.courseId) filter.course = new Types.ObjectId(filters.courseId);
  if (filters.isActive !== undefined) filter.isActive = filters.isActive;
  const { items, total } = await LmsChallengeDao.listChallenges(filter, page.skip, page.limit);
  return {
    challenges: items,
    pagination: { currentPage: page.page, total, limit: page.limit, totalPages: Math.ceil(total / page.limit) }
  };
};

// ---------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------
const ANNOUNCEMENT_FIELDS = ['title', 'content', 'course', 'batch', 'priority', 'attachments', 'isActive', 'expiresAt'];

export const createAnnouncement = async (data: Partial<IAnnouncement>, author: { id: Id; name: string }) =>
  BellDao.createAnnouncement({
    ...pick(data, ANNOUNCEMENT_FIELDS),
    author: new Types.ObjectId(String(author.id)),
    authorName: author.name,
    date: new Date()
  });

export const updateAnnouncement = async (id: string, data: Partial<IAnnouncement>) => {
  const updated = await BellDao.updateAnnouncement(id, pick(data, ANNOUNCEMENT_FIELDS));
  if (!updated) throw new ErrorHandler(404, 'Announcement not found');
  return updated;
};

export const listAnnouncements = async (page: { page: number; limit: number; skip: number }) => {
  const { items, total } = await BellDao.listAnnouncements(page.skip, page.limit);
  return {
    announcements: items,
    pagination: { currentPage: page.page, total, limit: page.limit, totalPages: Math.ceil(total / page.limit) }
  };
};
