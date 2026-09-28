import logger from '../config/logger';
import ErrorHandler from './error-handler';

// VdoCipher playback: the server asks VdoCipher for a short-lived OTP and
// the player uses { otp, playbackInfo }. The API secret never leaves the server.
//   VDOCIPHER_API_SECRET  required
//   VDOCIPHER_OTP_TTL     seconds the OTP stays valid to START playback (default 300)
//   VDOCIPHER_WATERMARK   "true" adds a faint moving watermark with the student's ID
//                         (ID, not name: students are minors)

export interface PlaybackInfo {
  otp: string;
  playbackInfo: string;
}

export const vdoCipherConfigured = (): boolean => !!process.env.VDOCIPHER_API_SECRET;

const ttlSeconds = (): number => {
  const ttl = Number(process.env.VDOCIPHER_OTP_TTL);
  return Number.isFinite(ttl) && ttl >= 60 && ttl <= 86400 ? Math.floor(ttl) : 300;
};

export const getPlaybackOtp = async (videoId: string, viewerId?: string): Promise<PlaybackInfo> => {
  if (!vdoCipherConfigured()) throw new ErrorHandler(503, 'Video playback is not set up yet');

  const body: Record<string, unknown> = { ttl: ttlSeconds() };
  if (viewerId && process.env.VDOCIPHER_WATERMARK === 'true') {
    body.annotate = JSON.stringify([
      { type: 'rtext', text: `ID ${viewerId}`, alpha: '0.45', color: '0xFFFFFF', size: '13', interval: '5000' }
    ]);
  }

  let res: Response;
  try {
    res = await fetch(`https://dev.vdocipher.com/api/videos/${encodeURIComponent(videoId)}/otp`, {
      method: 'POST',
      headers: {
        Authorization: `Apisecret ${process.env.VDOCIPHER_API_SECRET}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) {
    logger.warn('VdoCipher OTP request failed', { videoId, error: (e as Error).message });
    throw new ErrorHandler(502, 'Could not load the video right now. Please try again.');
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    logger.warn('VdoCipher OTP error', { videoId, status: res.status, detail });
    throw new ErrorHandler(
      res.status === 404 ? 404 : 502,
      res.status === 404 ? 'Video not found' : 'Could not load the video right now. Please try again.'
    );
  }

  const data = (await res.json()) as Partial<PlaybackInfo>;
  if (!data.otp || !data.playbackInfo) {
    logger.warn('VdoCipher OTP response missing fields', { videoId });
    throw new ErrorHandler(502, 'Could not load the video right now. Please try again.');
  }
  return { otp: data.otp, playbackInfo: data.playbackInfo };
};
