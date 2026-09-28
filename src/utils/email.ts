import logger from '../config/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// One place to plug in the email provider. Ships with Resend's HTTP API
// (set RESEND_API_KEY and EMAIL_FROM). To use SES / SendGrid / MSG91 email
// instead, replace the body of sendEmail — nothing else changes.
export const emailConfigured = (): boolean => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;

export const sendEmail = async (msg: EmailMessage): Promise<void> => {
  if (!emailConfigured()) throw new Error('Email provider not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html })
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    logger.warn('Email send failed', { status: res.status, detail });
    throw new Error(`Email provider returned ${res.status}`);
  }
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Simple, friendly template for every notification email
export const renderNotificationEmail = (p: { name: string; title: string; body?: string; link?: string }): Omit<EmailMessage, 'to'> => {
  const base = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  const url = p.link ? (p.link.startsWith('http') ? p.link : `${base}${p.link}`) : base;
  const text = `Hi ${p.name},\n\n${p.title}\n${p.body ? `\n${p.body}\n` : ''}${url ? `\nOpen: ${url}\n` : ''}\n— Team Kokoon Labs`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">
  <p>Hi ${escapeHtml(p.name)},</p>
  <p style="font-size:17px;font-weight:600">${escapeHtml(p.title)}</p>
  ${p.body ? `<p>${escapeHtml(p.body)}</p>` : ''}
  ${url ? `<p><a href="${escapeHtml(url)}" style="background:#1D9E75;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open Kokoon Labs</a></p>` : ''}
  <p style="color:#6b7280">— Team Kokoon Labs</p></div>`;
  return { subject: p.title, text, html };
};
