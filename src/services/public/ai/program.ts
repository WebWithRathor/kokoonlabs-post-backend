import type { Catalog, CatalogBlock } from './catalog';

// What the model sends back (the build_project tool's input), checked
// against the catalog before it reaches the student's canvas.

export type Value = string | number | boolean;

export interface Step {
  // A block already on the canvas that is kept (its id from the canvas)
  id?: string;
  type: string;
  values?: Record<string, Value>;
  // Only when the student asked for a port: port1..port4, i2c1, i2c2,
  // s1..s5, m1..m4, header
  connector?: string;
  // Names the physical part: blocks of one type with the same part name
  // drive the same part (one servo set to two angles); different names are
  // different parts (two servos)
  part?: string;
  body?: Step[];
  then?: Step[];
  elifs?: { condition: string; body: Step[] }[];
  else?: Step[];
}

export interface Program {
  title: string;
  // What it does, in a sentence or two
  explanation: string;
  // How it works, in program order (2 to 5 short points)
  howItWorks: string[];
  // Things to do once it runs, to see it work (1 to 3)
  tryIt: string[];
  steps: Step[];
  // Blocks that stand on their own, beside the program (IoT command handlers)
  events: Step[];
}

export const CONNECTORS = [
  'port1', 'port2', 'port3', 'port4', 'i2c1', 'i2c2',
  's1', 's2', 's3', 's4', 's5', 'm1', 'm2', 'm3', 'm4', 'header'
];

export const MAX_BLOCKS = 60;

const stepSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Only to keep a block that is already on the canvas: its id.' },
    type: { type: 'string', description: 'Block type from the catalog.' },
    values: {
      type: 'object',
      description: 'Block settings by binding name. Leave out pins and ports.',
      additionalProperties: { type: ['string', 'number', 'boolean'] }
    },
    connector: { type: 'string', enum: CONNECTORS, description: 'Only when the student asked for this port.' },
    part: { type: 'string', description: 'Only when the project has two or more of the same part: a name for each, e.g. "left servo".' },
    body: { type: 'array', items: { $ref: '#/$defs/step' }, description: 'Blocks inside a loop or a block with a body.' },
    then: { type: 'array', items: { $ref: '#/$defs/step' }, description: 'logic_if_else: runs when the condition is true.' },
    elifs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { condition: { type: 'string' }, body: { type: 'array', items: { $ref: '#/$defs/step' } } },
        required: ['condition', 'body']
      },
      description: 'logic_if_else: more conditions, checked in order.'
    },
    else: { type: 'array', items: { $ref: '#/$defs/step' }, description: 'logic_if_else: runs when no condition is true.' }
  },
  required: ['type']
};

export const BUILD_TOOL = {
  name: 'build_project',
  description:
    'Puts the whole program on the student\'s canvas, replacing what is there. The editor wires the hardware and writes the code from these blocks.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Short project name, e.g. "Night Light".' },
      explanation: { type: 'string', description: 'What the project does, 1 or 2 short sentences for a child.' },
      how_it_works: {
        type: 'array',
        items: { type: 'string' },
        description:
          '2 to 5 short points in program order, each naming the block(s) it is about, e.g. "The LDR Sensor block reads how bright the room is and saves it in light."'
      },
      try_it: {
        type: 'array',
        items: { type: 'string' },
        description: '1 to 3 things to do once it runs, to see it work, e.g. "Cover the LDR with your hand: the LED turns on."'
      },
      steps: { type: 'array', items: { $ref: '#/$defs/step' }, description: 'The program, top to bottom.' },
      events: {
        type: 'array',
        items: { $ref: '#/$defs/step' },
        description: 'Event blocks that stand on their own beside the program (iot_on_command, with its body). Leave out when there are none.'
      }
    },
    required: ['title', 'explanation', 'how_it_works', 'try_it', 'steps'],
    $defs: { step: stepSchema }
  }
};

const isValue = (v: unknown): v is Value => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/**
 * Checks the program. Problems the model must fix come back as errors;
 * small ones (unknown settings, pins it should not set) are dropped.
 */
export const checkProgram = (
  input: unknown,
  catalog: Catalog,
  canvasIds: Set<string>
): { program: Program | null; errors: string[] } => {
  const errors: string[] = [];
  const raw = (input ?? {}) as Partial<Program> & { how_it_works?: unknown; try_it?: unknown };
  const lines = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .slice(0, max)
      .map(x => x.trim().slice(0, 240));
  if (!Array.isArray(raw.steps)) return { program: null, errors: ['`steps` must be a list of blocks.'] };
  let count = 0;
  const seenIds = new Set<string>();

  const checkList = (list: unknown, where: string): Step[] => {
    if (list === undefined) return [];
    if (!Array.isArray(list)) {
      errors.push(`${where} must be a list of blocks.`);
      return [];
    }
    return list.map((s, i) => checkStep(s, `${where}[${i}]`)).filter((s): s is Step => s !== null);
  };

  const checkStep = (s: unknown, where: string): Step | null => {
    const step = (s ?? {}) as Step;
    count++;
    const block: CatalogBlock | undefined = step.type ? catalog.blocks.get(step.type) : undefined;
    if (!block) {
      errors.push(`${where}: "${step.type}" is not a block in the catalog.`);
      return null;
    }
    const out: Step = { type: block.type };
    if (step.id && canvasIds.has(step.id) && !seenIds.has(step.id)) {
      out.id = step.id;
      seenIds.add(step.id);
    }
    const values: Record<string, Value> = {};
    for (const [key, v] of Object.entries(step.values ?? {})) {
      const w = block.widgets.find(x => x.binding === key);
      if (!w || w.hardware || !isValue(v)) continue;
      if (w.options && !w.options.includes(String(v))) {
        errors.push(`${where} (${block.type}): "${key}" must be one of ${w.options.map(o => JSON.stringify(o)).join(', ')}, not ${JSON.stringify(v)}.`);
        continue;
      }
      values[key] = v;
    }
    if (Object.keys(values).length) out.values = values;
    if (step.connector && CONNECTORS.includes(step.connector)) out.connector = step.connector;
    if (typeof step.part === 'string' && step.part.trim()) out.part = step.part.trim().slice(0, 40);

    if (block.type === 'logic_if_else') {
      out.then = checkList(step.then ?? step.body, `${where}.then`);
      if (step.elifs !== undefined) {
        if (!Array.isArray(step.elifs)) errors.push(`${where}.elifs must be a list.`);
        else
          out.elifs = step.elifs.map((e, i) => ({
            condition: String(e?.condition ?? '').trim() || 'False',
            body: checkList(e?.body, `${where}.elifs[${i}].body`)
          }));
      }
      if (step.else !== undefined) out.else = checkList(step.else, `${where}.else`);
    } else if (block.hasBody) {
      out.body = checkList(step.body, `${where}.body`);
    } else if (step.body?.length || step.then?.length || step.else?.length) {
      errors.push(`${where}: ${block.type} has no body. Put those blocks after it instead.`);
    }
    return out;
  };

  const steps = checkList(raw.steps, 'steps');
  const events = checkList((raw as { events?: unknown }).events, 'events');
  // Event blocks only stand on their own, and only they do
  const misplaced = (list: Step[], where: string) => {
    const walk = (l: Step[] | undefined) =>
      (l ?? []).forEach(s => {
        if (catalog.blocks.get(s.type)?.event) errors.push(`${where}: ${s.type} can't be inside the program. Put it in events.`);
        walk(s.body);
        walk(s.then);
        walk(s.else);
        s.elifs?.forEach(e => walk(e.body));
      });
    walk(list);
  };
  misplaced(steps, 'steps');
  events.forEach((e, i) => {
    if (!catalog.blocks.get(e.type)?.event) errors.push(`events[${i}]: ${e.type} is not an event block. Put it in steps.`);
    misplaced(e.body ?? [], `events[${i}].body`);
  });
  errors.push(...checkIot([...steps, ...events]));
  if (count > MAX_BLOCKS) errors.push(`Too many blocks (${count}). Use at most ${MAX_BLOCKS}.`);
  if (!steps.length && !errors.length) errors.push('The program has no blocks.');
  if (errors.length) return { program: null, errors };
  return {
    program: {
      title: String(raw.title ?? '').trim().slice(0, 60) || 'My Project',
      explanation: String(raw.explanation ?? '').trim().slice(0, 600),
      howItWorks: lines(raw.how_it_works ?? raw.howItWorks, 6),
      tryIt: lines(raw.try_it ?? raw.tryIt, 3),
      steps,
      events
    },
    errors
  };
};

const IOT_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** The editor's IoT Studio rules, so the model fixes its program before the student sees it. */
export const checkIot = (all: Step[]): string[] => {
  const found: Step[] = [];
  const walk = (l: Step[] | undefined) =>
    (l ?? []).forEach(s => {
      found.push(s);
      walk(s.body);
      walk(s.then);
      walk(s.else);
      s.elifs?.forEach(e => walk(e.body));
    });
  walk(all);
  const iot = found.filter(s => s.type.startsWith('iot_'));
  if (!iot.length) return [];
  const errors: string[] = [];
  const v = (s: Step, k: string) => String(s.values?.[k] ?? '').trim();
  const of = (t: string) => iot.filter(s => s.type === t);

  if (of('iot_wifi').length !== 1) errors.push('IoT Studio programs need exactly one iot_wifi block, at the start of steps.');
  if (of('iot_connect').length !== 1) errors.push('IoT Studio programs need exactly one iot_connect block, after iot_wifi.');
  const declared = new Map<string, string>();
  for (const d of of('iot_declare')) {
    const key = v(d, 'key');
    if (!IOT_KEY.test(key)) errors.push(`iot_declare key "${key}" is not valid: small letters, digits and _, starting with a letter.`);
    else if (declared.has(key)) errors.push(`The key "${key}" is declared twice.`);
    else declared.set(key, v(d, 'direction') || 'telemetry');
    const min = v(d, 'min');
    const max = v(d, 'max');
    if ((min && !Number.isFinite(Number(min))) || (max && !Number.isFinite(Number(max)))) errors.push(`iot_declare "${key}": min and max must be numbers.`);
  }
  const handled = new Set<string>();
  for (const s of iot) {
    if (!['iot_send', 'iot_on_command', 'iot_last_value'].includes(s.type)) continue;
    const key = v(s, 'key');
    const dir = declared.get(key);
    if (!dir) {
      errors.push(`${s.type} uses "${key}", which no iot_declare declares.`);
      continue;
    }
    if (s.type === 'iot_send') {
      if (dir === 'command') errors.push(`"${key}" is a command (IoT Studio to board), so iot_send can't send it: make it telemetry or bidirectional.`);
      if (!v(s, 'value')) errors.push(`iot_send "${key}" needs a value (a Python expression).`);
    } else if (dir === 'telemetry') {
      errors.push(`"${key}" is telemetry (board to IoT Studio), so ${s.type} can't receive it: make it command or bidirectional.`);
    }
    if (s.type === 'iot_on_command') {
      if (handled.has(key)) errors.push(`Only one iot_on_command per key ("${key}" has more).`);
      handled.add(key);
    }
  }
  return errors;
};
