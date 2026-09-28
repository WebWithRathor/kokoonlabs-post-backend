import Notification from '../models/notification.model';
import User from '../models/user.model';
import { emailConfigured, renderNotificationEmail, sendEmail } from '../utils/email';
import logger from '../config/logger';

const PER_RUN = 50;
const STALE_CLAIM_MS = 10 * 60_000;

// Sends pending notification emails. Each email is CLAIMED first
// (pending -> sending in one atomic write), so two servers never send the
// same email. Claims older than 10 minutes (a crash mid-send) go back to pending.
export const runEmailWorker = async (): Promise<{ sent: number; failed: number; skipped: number }> => {
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (!emailConfigured()) return result;

  await Notification.updateMany(
    { emailStatus: 'sending', emailClaimedAt: { $lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    { $set: { emailStatus: 'pending' }, $unset: { emailClaimedAt: 1 } }
  );

  for (let i = 0; i < PER_RUN; i++) {
    const n = await Notification.findOneAndUpdate(
      { emailStatus: 'pending' },
      { $set: { emailStatus: 'sending', emailClaimedAt: new Date() } },
      { sort: { createdAt: 1 }, new: true }
    ).lean();
    if (!n) break;

    const user = await User.findById(n.user).select('email name').lean<{ email?: string; name?: { firstName?: string } }>();
    if (!user?.email) {
      // Many students sign in by phone: no email address, nothing to send
      await Notification.updateOne({ _id: n._id }, { $set: { emailStatus: 'skipped' }, $unset: { emailClaimedAt: 1 } });
      result.skipped++;
      continue;
    }

    try {
      const msg = renderNotificationEmail({
        name: user.name?.firstName || 'there',
        title: n.title,
        body: n.body,
        link: n.link
      });
      await sendEmail({ to: user.email, ...msg });
      await Notification.updateOne(
        { _id: n._id },
        { $set: { emailStatus: 'sent', emailSentAt: new Date() }, $unset: { emailClaimedAt: 1, emailError: 1 } }
      );
      result.sent++;
    } catch (err) {
      await Notification.updateOne(
        { _id: n._id },
        { $set: { emailStatus: 'failed', emailError: (err as Error).message.slice(0, 300) }, $unset: { emailClaimedAt: 1 } }
      );
      result.failed++;
    }
  }
  if (result.sent || result.failed) logger.info('Email worker run', result);
  return result;
};
