import {
  ControlWidgetType,
  IControlActions,
  IControlBox,
  IControlPageLayout,
  IResolvedControlPage
} from '../interfaces/control-page.interface';

// Checking a control page before it's saved (the editor's copy) or shown to
// anyone with a Bluetooth page link (the laid-out copy). Same rules as the
// editor's utils/controlPage.ts: known widgets only, boxes on the grid,
// short text, variable names that Python accepts.

export const WIDGET_TYPES: ControlWidgetType[] = ['value', 'gauge', 'chart', 'led', 'button', 'switch', 'slider', 'dpad', 'number', 'text', 'label'];
export const MAX_WIDGETS = 40;
export const MAX_ROWS = 60;
const COLS = [12, 8, 4]; // computer, tablet, phone
const LIMIT = 65535;
const NAME_RE = /^[A-Za-z_]\w{0,39}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

// Text without control characters (new lines, tabs...)
const text = (v: unknown, max: number) =>
  Array.from(String(v ?? ''))
    .filter((ch) => ch >= ' ' && ch !== '\u007f')
    .join('')
    .trim()
    .slice(0, max);

const widgetType = (v: unknown): ControlWidgetType | null => (WIDGET_TYPES.includes(v as ControlWidgetType) ? (v as ControlWidgetType) : null);
const variable = (t: ControlWidgetType, v: unknown) => {
  const n = text(v, 40);
  return t === 'label' || !NAME_RE.test(n) ? '' : n;
};
const colour = (v: unknown) => (typeof v === 'string' && HEX_RE.test(v) ? v : '');
const list = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, MAX_WIDGETS);

// What a control sets its variable to (button / switch on-off, each d-pad
// arrow, a slider's step). Only what isn't the default is kept.
const DPAD = ['up', 'down', 'left', 'right', 'center'];
const actionText = (v: unknown) =>
  Array.from(String(v ?? ''))
    .filter((ch) => ch >= ' ' && ch !== '\u007f')
    .join('')
    .slice(0, 20);
const actions = (t: ControlWidgetType, raw: unknown): IControlActions | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: IControlActions = {};
  if (t === 'button' || t === 'switch' || t === 'dpad') {
    const off = t === 'dpad' ? '' : 'False';
    if (t !== 'dpad' && r.on !== undefined && actionText(r.on) !== 'True') out.on = actionText(r.on);
    if (r.off !== undefined && actionText(r.off) !== off) out.off = actionText(r.off);
  }
  if (t === 'dpad' && Array.isArray(r.dirs) && r.dirs.length === DPAD.length) {
    const dirs = r.dirs.map(actionText);
    if (dirs.some((d, i) => d !== DPAD[i])) out.dirs = dirs;
  }
  if (t === 'slider' && r.step !== undefined) {
    const step = Math.round(Number(r.step) * 1000) / 1000;
    if (Number.isFinite(step) && step > 0 && step <= 10000 && step !== 1) out.step = step;
  }
  return Object.keys(out).length ? out : undefined;
};

const box = (raw: unknown, cols: number): IControlBox | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;
  const w = int(b.w, 1, cols, 1);
  return { x: int(b.x, 0, cols - w, 0), y: int(b.y, 0, MAX_ROWS, 0), w, h: int(b.h, 1, 12, 1) };
};

/** The editor's page (for the library). null: not a page. */
export const sanitizeControlPage = (input: unknown): IControlPageLayout | null => {
  if (!input || typeof input !== 'object' || !Array.isArray((input as { widgets?: unknown }).widgets)) return null;
  const raw = input as Record<string, unknown>;
  const widgets: IControlPageLayout['widgets'] = [];
  for (const w of list(raw.widgets)) {
    const t = widgetType(w.t);
    if (!t) continue;
    const pos = (w.pos ?? {}) as Record<string, unknown>;
    const tablet = box(pos.tablet, COLS[1]);
    const phone = box(pos.phone, COLS[2]);
    widgets.push({
      i: text(w.i, 12) || Math.random().toString(36).slice(2, 9),
      t,
      n: variable(t, w.n),
      l: text(w.l, 40),
      u: text(w.u, 10),
      min: int(w.min, -LIMIT, LIMIT, 0),
      max: int(w.max, -LIMIT, LIMIT, 100),
      c: colour(w.c),
      ...(actions(t, w.a) ? { a: actions(t, w.a) } : {}),
      pos: { desktop: box(pos.desktop, COLS[0]) ?? { x: 0, y: 0, w: 3, h: 2 }, ...(tablet ? { tablet } : {}), ...(phone ? { phone } : {}) }
    });
  }
  return {
    title: text(raw.title, 40) || 'Kokoon Control',
    theme: raw.theme === 'light' ? 'light' : 'dark',
    accent: colour(raw.accent) || '#7c5dfa',
    widgets
  };
};

/** The laid-out page (inside a project's btLayout). null: none, or not a page. */
export const sanitizeResolvedPage = (input: unknown): IResolvedControlPage | null => {
  if (!input || typeof input !== 'object' || !Array.isArray((input as { w?: unknown }).w)) return null;
  const raw = input as Record<string, unknown>;
  const w: IResolvedControlPage['w'] = [];
  for (const x of list(raw.w)) {
    const t = widgetType(x.t);
    if (!t || !Array.isArray(x.p) || x.p.length !== 3) continue;
    const p = (x.p as unknown[]).map((b, d) => {
      const a = Array.isArray(b) ? b : [];
      const b4 = box({ x: a[0], y: a[1], w: a[2], h: a[3] }, COLS[d])!;
      return [b4.x, b4.y, b4.w, b4.h] as [number, number, number, number];
    });
    const act = actions(t, x.act);
    w.push({ t, n: variable(t, x.n), l: text(x.l, 40), u: text(x.u, 10), min: int(x.min, -LIMIT, LIMIT, 0), max: int(x.max, -LIMIT, LIMIT, 100), c: colour(x.c), ...(act ? { act } : {}), p });
  }
  return { title: text(raw.title, 40) || 'Kokoon Control', th: raw.th === 'light' ? 'light' : 'dark', a: colour(raw.a) || '#7c5dfa', w };
};
