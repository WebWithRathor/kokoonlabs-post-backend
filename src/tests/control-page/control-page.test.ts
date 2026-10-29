import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_WIDGETS, sanitizeControlPage, sanitizeResolvedPage } from '../../utils/control-page';
import { sanitizeBtLayout } from '../../utils/bt-page';

const widget = (over: Record<string, unknown> = {}) => ({
  i: 'w1',
  t: 'gauge',
  n: 'temp',
  l: 'Temperature',
  u: '°C',
  min: 0,
  max: 50,
  c: '#22c55e',
  pos: { desktop: { x: 0, y: 0, w: 4, h: 3 } },
  ...over
});

describe('sanitizeControlPage', () => {
  it('keeps a valid page', () => {
    const page = sanitizeControlPage({ title: 'Garden', theme: 'light', accent: '#0ea5e9', widgets: [widget()] });
    assert.deepEqual(page, {
      title: 'Garden',
      theme: 'light',
      accent: '#0ea5e9',
      widgets: [{ i: 'w1', t: 'gauge', n: 'temp', l: 'Temperature', u: '°C', min: 0, max: 50, c: '#22c55e', pos: { desktop: { x: 0, y: 0, w: 4, h: 3 } } }]
    });
  });

  it('is not a page without a widget list', () => {
    assert.equal(sanitizeControlPage(null), null);
    assert.equal(sanitizeControlPage({ title: 'x' }), null);
    assert.equal(sanitizeControlPage('page'), null);
  });

  it('drops unknown widgets and bad variable names, colours and text', () => {
    const page = sanitizeControlPage({
      title: 'A\nB',
      theme: 'neon',
      accent: 'red',
      widgets: [widget({ t: 'script' }), widget({ n: '1bad name', c: 'javascript:', l: 'x\u0000y' }), widget({ t: 'label', n: 'temp' })]
    })!;
    assert.equal(page.title, 'AB');
    assert.equal(page.theme, 'dark');
    assert.equal(page.accent, '#7c5dfa');
    assert.equal(page.widgets.length, 2);
    assert.deepEqual([page.widgets[0].n, page.widgets[0].c, page.widgets[0].l], ['', '', 'xy']);
    // A label shows text only, never a variable
    assert.equal(page.widgets[1].n, '');
  });

  it('keeps what controls set, without the defaults', () => {
    const page = sanitizeControlPage({
      widgets: [
        widget({ i: 'b', t: 'button', a: { on: '5', off: 'False', bogus: 1 } }),
        widget({ i: 'd', t: 'dpad', a: { dirs: ['F', 'B', 'L', 'R', 'S'], off: 'stop\n' } }),
        widget({ i: 's', t: 'slider', a: { step: 0.5 } }),
        widget({ i: 'x', t: 'switch', a: { on: 'True', off: 'False' } }),
        widget({ i: 'g', t: 'gauge', a: { on: '1' } })
      ]
    })!;
    assert.deepEqual(
      page.widgets.map((w) => w.a),
      [{ on: '5' }, { dirs: ['F', 'B', 'L', 'R', 'S'], off: 'stop' }, { step: 0.5 }, undefined, undefined]
    );
    const resolved = sanitizeResolvedPage({ w: [{ t: 'button', n: 'go', p: [[0, 0, 2, 2], [0, 0, 2, 2], [0, 0, 2, 2]], act: { on: 'go', off: '0' } }] })!;
    assert.deepEqual(resolved.w[0].act, { on: 'go', off: '0' });
  });

  it('keeps boxes on each device grid', () => {
    const page = sanitizeControlPage({
      widgets: [widget({ pos: { desktop: { x: 11, y: -3, w: 40, h: 99 }, tablet: { x: 7, y: 2, w: 3, h: 2 }, phone: 'x' } })]
    })!;
    assert.deepEqual(page.widgets[0].pos, { desktop: { x: 0, y: 0, w: 12, h: 12 }, tablet: { x: 5, y: 2, w: 3, h: 2 } });
  });

  it(`keeps at most ${MAX_WIDGETS} widgets`, () => {
    const page = sanitizeControlPage({ widgets: Array.from({ length: 60 }, (_, i) => widget({ i: `w${i}` })) })!;
    assert.equal(page.widgets.length, MAX_WIDGETS);
  });
});

describe('sanitizeResolvedPage', () => {
  it('keeps a laid-out page and fits boxes to 12 / 8 / 4 columns', () => {
    const page = sanitizeResolvedPage({
      title: 'Car',
      th: 'dark',
      a: '#f59e0b',
      w: [{ t: 'dpad', n: 'move', l: 'Drive', u: '', min: 0, max: 100, c: '', p: [[0, 0, 4, 4], [6, 0, 4, 4], [0, 0, 9, 4]] }]
    });
    assert.deepEqual(page, {
      title: 'Car',
      th: 'dark',
      a: '#f59e0b',
      w: [{ t: 'dpad', n: 'move', l: 'Drive', u: '', min: 0, max: 100, c: '', p: [[0, 0, 4, 4], [4, 0, 4, 4], [0, 0, 4, 4]] }]
    });
  });

  it('drops widgets without a box per device', () => {
    const page = sanitizeResolvedPage({ w: [{ t: 'value', n: 'a', p: [[0, 0, 2, 2]] }] })!;
    assert.equal(page.w.length, 0);
    assert.equal(sanitizeResolvedPage({ w: 'x' }), null);
  });
});

describe('sanitizeBtLayout with a page', () => {
  it('keeps the checked page and drops a bad one', () => {
    const base = { title: 'Car', shows: [], controls: [] };
    const good = sanitizeBtLayout({ ...base, page: { title: 'Car', th: 'light', a: '#7c5dfa', w: [{ t: 'led', n: 'on', p: [[0, 0, 1, 1], [0, 0, 1, 1], [0, 0, 1, 1]] }] } })!;
    assert.equal(good.page?.th, 'light');
    assert.equal(good.page?.w.length, 1);
    const bad = sanitizeBtLayout({ ...base, page: '<script>' })!;
    assert.equal(bad.page ?? null, null);
  });
});
