import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProgram } from '../../services/public/ai/program';
import type { Catalog, CatalogBlock } from '../../services/public/ai/catalog';

const block = (b: Partial<CatalogBlock> & { type: string }): CatalogBlock => ({
  title: b.type,
  category: 'x',
  description: '',
  widgets: [],
  code: '',
  hasBody: false,
  ...b
});

const catalog: Catalog = {
  text: '',
  blocks: new Map(
    [
      block({ type: 'loop_forever', hasBody: true }),
      block({ type: 'logic_if_else', widgets: [{ type: 'text', binding: 'condition', hardware: false }] }),
      block({
        type: 'ldr_sensor',
        widgets: [
          { type: 'pin', binding: 'gpio', hardware: true },
          { type: 'text', binding: 'ldr_out', hardware: false }
        ]
      }),
      block({ type: 'general_sleep', widgets: [{ type: 'dropdown', binding: 'unit', options: ['sec', 'ms'], hardware: false }] })
    ].map(b => [b.type, b])
  )
};

test('a good program passes; pins and unknown settings are dropped', () => {
  const { program, errors } = checkProgram(
    {
      title: 'Night Light',
      explanation: 'It turns on in the dark.',
      steps: [
        {
          type: 'loop_forever',
          body: [
            { type: 'ldr_sensor', values: { ldr_out: 'light', gpio: 99, color: 'red' }, part: ' left ' },
            { type: 'logic_if_else', values: { condition: 'light < 1500' }, then: [{ type: 'general_sleep' }] }
          ]
        }
      ]
    },
    catalog,
    new Set()
  );
  assert.deepEqual(errors, []);
  const ldr = program!.steps[0].body![0];
  assert.deepEqual(ldr.values, { ldr_out: 'light' });
  assert.equal(ldr.part, 'left');
  assert.equal(program!.steps[0].body![1].then!.length, 1);
});

test('unknown blocks, bad options and misplaced bodies come back as errors', () => {
  const { program, errors } = checkProgram(
    {
      title: 'x',
      explanation: '',
      steps: [
        { type: 'laser_cannon' },
        { type: 'general_sleep', values: { unit: 'hours' } },
        { type: 'ldr_sensor', body: [{ type: 'general_sleep' }] }
      ]
    },
    catalog,
    new Set()
  );
  assert.equal(program, null);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /laser_cannon/);
  assert.match(errors[1], /"unit" must be one of/);
  assert.match(errors[2], /has no body/);
});

test('ids are kept only for blocks that are on the canvas, once', () => {
  const { program } = checkProgram(
    { title: 't', explanation: '', steps: [{ id: 'a', type: 'general_sleep' }, { id: 'a', type: 'general_sleep' }, { id: 'zzz', type: 'general_sleep' }] },
    catalog,
    new Set(['a'])
  );
  assert.deepEqual(program!.steps.map(s => s.id), ['a', undefined, undefined]);
});

test('IoT Studio programs follow the editor rules', () => {
  const iotCatalog: Catalog = {
    text: '',
    blocks: new Map(
      [
        block({ type: 'loop_forever', hasBody: true }),
        block({ type: 'iot_wifi', widgets: [{ type: 'text', binding: 'wifiSsid', hardware: true }] }),
        block({ type: 'iot_connect' }),
        block({
          type: 'iot_declare',
          widgets: ['key', 'direction', 'dataType', 'min', 'max'].map(b => ({ type: 'text', binding: b, hardware: false }))
        }),
        block({ type: 'iot_send', widgets: ['key', 'value'].map(b => ({ type: 'text', binding: b, hardware: false })) }),
        block({ type: 'iot_on_command', hasBody: true, event: true, widgets: [{ type: 'text', binding: 'key', hardware: false }] })
      ].map(b => [b.type, b])
    )
  };
  const good = {
    title: 'IoT',
    explanation: '',
    steps: [
      { type: 'iot_wifi', values: { wifiSsid: 'MyHome' } },
      { type: 'iot_connect' },
      { type: 'iot_declare', values: { key: 'temperature', direction: 'telemetry' } },
      { type: 'iot_declare', values: { key: 'led_on', direction: 'command', dataType: 'boolean' } },
      { type: 'loop_forever', body: [{ type: 'iot_send', values: { key: 'temperature', value: 'temp' } }] }
    ],
    events: [{ type: 'iot_on_command', values: { key: 'led_on' }, body: [] }]
  };
  const ok = checkProgram(good, iotCatalog, new Set());
  assert.deepEqual(ok.errors, []);
  // The model never sets the Wi-Fi
  assert.equal(ok.program!.steps[0].values, undefined);
  assert.equal(ok.program!.events.length, 1);

  const bad = checkProgram(
    {
      ...good,
      steps: [
        { type: 'iot_connect' },
        { type: 'iot_declare', values: { key: 'Temp!', direction: 'telemetry' } },
        { type: 'loop_forever', body: [{ type: 'iot_send', values: { key: 'led_on', value: '1' } }, { type: 'iot_on_command', values: { key: 'x' } }] }
      ],
      events: [{ type: 'iot_on_command', values: { key: 'temperature' } }]
    },
    iotCatalog,
    new Set()
  );
  assert.equal(bad.program, null);
  const all = bad.errors.join('\n');
  assert.match(all, /can't be inside the program/);
  assert.match(all, /exactly one iot_wifi/);
  assert.match(all, /"Temp!" is not valid/);
  assert.match(all, /uses "led_on", which no iot_declare declares/);
});
