import { randomInt } from 'crypto';
import { BtControlKind, IBtPageLayout } from '../interfaces';
import { sanitizeResolvedPage } from './control-page';

// Public Bluetooth pages (/bt/<code>): the code, and checking the layout a
// project sends before it's saved and shown to anyone with the link.

// No 0/o, 1/l/i: easy to read out and type. 31^8 codes, far too many to guess.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const BT_CODE_LENGTH = 8;
export const BT_CODE_RE = new RegExp(`^[${ALPHABET}]{${BT_CODE_LENGTH}}$`);

export const newBtCode = (): string =>
  Array.from({ length: BT_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** "K7X2-PQ9M" / " k7x2pq9m " -> "k7x2pq9m" */
export const normalizeBtCode = (code: unknown): string =>
  String(code ?? '').toLowerCase().replace(/[\s-]/g, '');

const KINDS: BtControlKind[] = ['button', 'switch', 'slider', 'number', 'text', 'dpad'];
const MAX_ITEMS = 16;
const LIMIT = 65535;
const NAME_RE = /^[A-Za-z_]\w{0,39}$/;

const text = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);

const num = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(-LIMIT, Math.min(LIMIT, n)) : fallback;
};

const asList = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, MAX_ITEMS);

/**
 * The layout to save: only known fields, valid variable names, short text.
 * null for no page (no Bluetooth block, or nothing usable sent).
 */
export const sanitizeBtLayout = (input: unknown): IBtPageLayout | null => {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  // One entry per variable name in each list (a value shown can also be a control)
  const uniqueIn = (seen: Set<string>) => (n: string) => NAME_RE.test(n) && !seen.has(n) && !!seen.add(n);
  const showOnce = uniqueIn(new Set());
  const controlOnce = uniqueIn(new Set());
  const shows = asList(raw.shows)
    .map((s) => ({ n: text(s.n, 40), l: text(s.l, 24), u: text(s.u, 10) }))
    .filter((s) => showOnce(s.n))
    .map((s) => ({ ...s, l: s.l || s.n }));
  const controls = asList(raw.controls)
    .map((c) => ({
      n: text(c.n, 40),
      l: text(c.l, 24),
      k: (KINDS.includes(c.k as BtControlKind) ? c.k : 'button') as BtControlKind,
      min: num(c.min, 0),
      max: num(c.max, 100)
    }))
    .filter((c) => controlOnce(c.n))
    .map((c) => ({ ...c, l: c.l || c.n }));
  // The designed page, when there is one
  const page = sanitizeResolvedPage(raw.page);
  return { title: text(raw.title, 40) || 'Kokoon Control', shows, controls, ...(page ? { page } : {}) };
};
