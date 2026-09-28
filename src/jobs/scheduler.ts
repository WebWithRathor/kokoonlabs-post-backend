import cron, { ScheduledTask } from 'node-cron';
import logger from '../config/logger';
import { emailConfigured } from '../utils/email';
import { istDay } from '../utils/ist-date';
import { runStreakReminder } from './streak-reminder.job';
import { runEmailWorker } from './email.job';

// Cron schedules in IST. Safe to run on several servers at once: reminders
// are deduplicated per day and emails are claimed before sending. Turn off
// with ENABLE_JOBS=false (e.g. on extra replicas).
const TIMEZONE = 'Asia/Kolkata';

// 8 PM, with hourly retries until 11 PM: a failed run, or a server that was
// down at 8, still gets the reminder out before midnight. Once a run
// succeeds, the later ones that day are skipped.
const STREAK_REMINDER_CRON = '0 20-23 * * *';
const EMAIL_WORKER_CRON = '* * * * *';

let lastReminderDay: string | null = null;
let tasks: ScheduledTask[] = [];

const streakReminderTask = async ({ date }: { date: Date }) => {
  const day = istDay(date);
  if (lastReminderDay === day) return;
  try {
    await runStreakReminder(date);
    lastReminderDay = day;
  } catch (err) {
    logger.error('Streak reminder failed, retrying next hour', { err });
  }
};

const emailWorkerTask = async () => {
  try {
    await runEmailWorker();
  } catch (err) {
    logger.error('Email worker failed', { err });
  }
};

export const startJobs = (): void => {
  if (process.env.ENABLE_JOBS === 'false') {
    logger.info('Background jobs disabled (ENABLE_JOBS=false)');
    return;
  }
  if (!emailConfigured()) logger.warn('Email not configured (RESEND_API_KEY, EMAIL_FROM): notification emails stay pending');

  const options = { timezone: TIMEZONE, noOverlap: true, unref: true };
  tasks = [
    cron.schedule(STREAK_REMINDER_CRON, streakReminderTask, { ...options, name: 'streak-reminder' }),
    cron.schedule(EMAIL_WORKER_CRON, emailWorkerTask, { ...options, name: 'email-worker' })
  ];
  logger.info('Background jobs started: 8 PM IST streak reminder, email worker every minute');
};

export const stopJobs = async (): Promise<void> => {
  await Promise.all(tasks.map(t => t.destroy()));
  tasks = [];
};
