import Block from '../../../models/block.model';
import AiBlockProfile, { type IAiBlockProfile } from '../../../models/ai-block-profile.model';
import Component, { type IComponent } from '../../../models/component.model';

// The blocks the AI may use: the published catalog plus the editor's
// built-in control blocks, described compactly for the model's prompt and
// kept as a lookup to check what the model sends back.

export interface CatalogWidget {
  type: string;
  binding: string;
  default?: unknown;
  options?: string[];
  // Pins / ports: the editor wires these, never the model
  hardware: boolean;
}

export interface CatalogBlock {
  type: string;
  title: string;
  category: string;
  description: string;
  widgets: CatalogWidget[];
  code: string;
  // Has a "DO" slot (loops, custom blocks with {__body__})
  hasBody: boolean;
  builtin?: boolean;
  // Stands on its own, not in the program's sequence (goes in `events`)
  event?: boolean;
  // Tips an admin saved with "Teach the AI"
  notes?: string;
}

export interface Catalog {
  blocks: Map<string, CatalogBlock>;
  // The prompt text for all blocks (same bytes every time: it is cached)
  text: string;
}

// Blocks the builder leaves out: they need a page designer, a second
// board, are for a different chip, or the editor no longer offers them
// (neopixelled: replaced by the built-in NeoPixel Matrix)
const HIDDEN = new Set(['wifi_block', 'bluetooth', 'live_sliders', 'shadow_arm_joint', 'space_test', 'mac_address', 'i2c_scan', 'neopixelled']);

const text = (binding: string, def: unknown = ''): CatalogWidget => ({ type: 'text', binding, default: def, hardware: false });
// Settings only the student fills in (Wi-Fi, their board): never the model
const studentOnly = (binding: string): CatalogWidget => ({ type: 'text', binding, hardware: true });

const IOT: CatalogBlock[] = [
  {
    type: 'iot_wifi',
    title: 'Connect to Wi-Fi',
    category: 'iot',
    description: 'Joins the Wi-Fi. The student types the Wi-Fi name and password in this block: never set them.',
    widgets: [studentOnly('wifiSsid'), studentOnly('wifiPassword')],
    code: 'iot_studio.wifi(...)',
    hasBody: false,
    builtin: true
  },
  {
    type: 'iot_connect',
    title: 'Connect to IoT Studio',
    category: 'iot',
    description: "Connects the board to IoT Studio as one of the student's boards (the editor picks the board). One per program.",
    widgets: [studentOnly('boardId'), studentOnly('boardName')],
    code: 'iot.loop()',
    hasBody: false,
    builtin: true
  },
  {
    type: 'iot_declare',
    title: 'Declare IoT variable',
    category: 'iot',
    description: 'Names a value the board shares with IoT Studio. One per variable, before the loop.',
    widgets: [
      text('key', 'temperature'),
      text('displayName', 'Temperature'),
      { type: 'dropdown', binding: 'dataType', default: 'float', options: ['boolean', 'integer', 'float', 'string', 'color', 'json'], hardware: false },
      { type: 'dropdown', binding: 'direction', default: 'telemetry', options: ['telemetry', 'command', 'bidirectional'], hardware: false },
      text('unit'),
      text('min'),
      text('max')
    ],
    code: '(declares the variable)',
    hasBody: false,
    builtin: true
  },
  {
    type: 'iot_send',
    title: 'Send IoT variable',
    category: 'iot',
    description: 'Sends a value (a Python expression) to IoT Studio for a telemetry or bidirectional key. At most once a second per key.',
    widgets: [text('key'), text('value')],
    code: "iot.send('{key}', {value})",
    hasBody: false,
    builtin: true
  },
  {
    type: 'iot_on_command',
    title: 'When IoT command received',
    category: 'iot',
    description: 'Runs its body when IoT Studio sends a command or bidirectional key; the new value is in `value`. Goes in `events`, one per key.',
    widgets: [text('key')],
    code: 'def on_iot_<key>(value): ...',
    hasBody: true,
    builtin: true,
    event: true
  },
  {
    type: 'iot_last_value',
    title: 'Last IoT command value',
    category: 'iot',
    description: 'Puts the last value IoT Studio sent for a command or bidirectional key into a variable.',
    widgets: [text('key'), text('var', 'led_value')],
    code: "{var} = iot.last('{key}')",
    hasBody: false,
    builtin: true
  },
  {
    type: 'iot_connected',
    title: 'IoT Studio connected?',
    category: 'iot',
    description: 'Puts True in a variable while the board is connected to IoT Studio.',
    widgets: [text('var', 'iot_online')],
    code: '{var} = iot.connected()',
    hasBody: false,
    builtin: true
  },
  {
    type: 'iot_rgb',
    title: 'Colour from R G B',
    category: 'iot',
    description: 'Makes a colour like "#ff8800" from red, green and blue (0 to 255) for a color variable.',
    widgets: [text('r', '0'), text('g', '0'), text('b', '0'), text('var', 'colour')],
    code: '{var} = iot_studio.rgb({r}, {g}, {b})',
    hasBody: false,
    builtin: true
  }
];

const BUILTINS: CatalogBlock[] = [
  {
    type: 'loop_forever',
    title: 'Forever Loop',
    category: 'loop',
    description: 'Runs the blocks in its body again and again.',
    widgets: [],
    code: 'while True:',
    hasBody: true,
    builtin: true
  },
  {
    type: 'loop_for',
    title: 'For Loop',
    category: 'loop',
    description: 'Runs its body a set number of times.',
    widgets: [
      { type: 'text', binding: 'var', default: 'i', hardware: false },
      { type: 'number', binding: 'count', default: 10, hardware: false }
    ],
    code: 'for {var} in range({count}):',
    hasBody: true,
    builtin: true
  },
  {
    type: 'loop_while',
    title: 'While Loop',
    category: 'loop',
    description: 'Runs its body while the Python condition is true.',
    widgets: [{ type: 'text', binding: 'condition', default: 'True', hardware: false }],
    code: 'while {condition}:',
    hasBody: true,
    builtin: true
  },
  {
    type: 'loop_break',
    title: 'Break',
    category: 'loop',
    description: 'Leaves the loop it is in.',
    widgets: [],
    code: 'break',
    hasBody: false,
    builtin: true
  },
  {
    type: 'logic_if_else',
    title: 'If / Else',
    category: 'logic',
    description: 'If the Python condition is true runs `then`, else checks `elifs` in order, else runs `else`.',
    widgets: [{ type: 'text', binding: 'condition', default: 'x > 0', hardware: false }],
    code: 'if {condition}: ... elif ...: ... else: ...',
    hasBody: false,
    builtin: true
  },
  {
    type: 'general_print',
    title: 'Print',
    category: 'general',
    description: 'Prints in the terminal. mode "text" prints content as a message; mode "var" prints content as a Python expression (a variable or f-string).',
    widgets: [
      { type: 'dropdown', binding: 'mode', default: 'text', options: ['text', 'var'], hardware: false },
      { type: 'text', binding: 'content', default: 'Hello World', hardware: false }
    ],
    code: 'print(...)',
    hasBody: false,
    builtin: true
  },
  {
    type: 'general_variable',
    title: 'Set Variable',
    category: 'general',
    description: 'Sets a variable to a Python expression.',
    widgets: [
      { type: 'text', binding: 'name', default: 'x', hardware: false },
      { type: 'text', binding: 'value', default: '10', hardware: false }
    ],
    code: '{name} = {value}',
    hasBody: false,
    builtin: true
  },
  {
    type: 'general_sleep',
    title: 'Sleep',
    category: 'general',
    description: 'Waits before the next block.',
    widgets: [
      { type: 'number', binding: 'duration', default: 1, hardware: false },
      { type: 'dropdown', binding: 'unit', default: 'sec', options: ['sec', 'ms'], hardware: false }
    ],
    code: 'time.sleep(...)',
    hasBody: false,
    builtin: true
  }
];

interface RawWidget {
  type?: string;
  binding?: string;
  label?: string;
  default?: unknown;
  options?: [string, string][];
}
interface RawBlock {
  type: string;
  title?: string;
  category?: string;
  description?: string;
  sections?: { widgets?: RawWidget[] }[];
  codegen?: string;
}

const PIN_NAME = /^(pin|pins|pot_pin|gpio|joypin|clk|in\d)$/;
const PIN_LABEL = /GPIO|^Port \d|^S[1-5]\b|^M[1-4]\b/;

/** A widget that picks pins or a port (wired by the editor, not the model). */
export const isHardwareWidget = (w: RawWidget): boolean => {
  if (w.type === 'pin') return true;
  const binding = String(w.binding ?? '');
  if (w.type === 'dropdown' && Array.isArray(w.options) && w.options.some(o => PIN_LABEL.test(String(o?.[1] ?? '')))) return true;
  return (w.type === 'number' || w.type === 'text') && PIN_NAME.test(binding);
};

const toCatalogBlock = (b: RawBlock): CatalogBlock => {
  const widgets: CatalogWidget[] = [];
  for (const s of b.sections ?? []) {
    for (const w of s.widgets ?? []) {
      if (!w?.binding || !w.type) continue;
      widgets.push({
        type: w.type,
        binding: w.binding,
        default: w.default,
        options: Array.isArray(w.options) ? w.options.map(o => String(o?.[0] ?? '')) : undefined,
        hardware: isHardwareWidget(w)
      });
    }
  }
  const code = String(b.codegen ?? '');
  return {
    type: b.type,
    title: String(b.title ?? b.type),
    category: String(b.category ?? 'other'),
    description: String(b.description ?? '').replace(/\s+/g, ' ').trim(),
    widgets,
    code,
    hasBody: /\{__body__\}/.test(code)
  };
};

const short = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? '');
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
};

const describe = (b: CatalogBlock): string => {
  const lines = [`- ${b.type} "${b.title}" [${b.category}]${b.event ? ' (event: put it in events)' : b.hasBody ? ' (has a body)' : ''}: ${b.description}`];
  const settable = b.widgets.filter(w => !w.hardware);
  if (settable.length) {
    lines.push(
      `  values: ${settable
        .map(w => `${w.binding}(${w.type}${w.options ? ` one of ${w.options.map(o => JSON.stringify(o)).join('|')}` : ''}) default ${short(w.default)}`)
        .join('; ')}`
    );
  }
  if (b.widgets.some(w => w.hardware)) lines.push('  wired automatically');
  if (b.notes) lines.push(`  tips: ${b.notes.replace(/\s+/g, ' ')}`);
  if (!b.builtin && b.code) {
    const code = b.code.replace(/\s*#[^\n]*/g, '').replace(/\n+/g, ' ⏎ ').trim();
    lines.push(`  code: ${code.length > 180 ? `${code.slice(0, 177)}...` : code}`);
  }
  return lines.join('\n');
};

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; catalog: Catalog } | null = null;

/** Rebuild the catalog on next use (a block profile was saved). */
export const resetCatalog = () => {
  cached = null;
};

/** The catalog, re-read from the database at most every 5 minutes. */
export const getCatalog = async (): Promise<Catalog> => {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.catalog;
  const [docs, profiles, components] = await Promise.all([
    Block.find({ status: 'published' }).lean() as unknown as Promise<RawBlock[]>,
    AiBlockProfile.find().lean() as unknown as Promise<IAiBlockProfile[]>,
    Component.find().sort({ name: 1 }).lean() as unknown as Promise<IComponent[]>
  ]);
  const profileOf = new Map(profiles.map(p => [p.blockType, p]));
  const published = docs
    .filter(d => d?.type && !HIDDEN.has(d.type))
    .map(d => ({ ...toCatalogBlock(d), notes: profileOf.get(d.type)?.notes || undefined }))
    .sort((a, b) => a.type.localeCompare(b.type));
  // Parts an admin marked as in the kit (beyond the list in the rules)
  const usable = new Set(published.map(b => b.type));
  // The kit from Admin > Components: how many of each, and the blocks that drive it
  const kitComponents = components
    .filter(c => c.inKit && c.kitQty > 0)
    .map(c => {
      const blocks = [...new Set(c.links.map(l => l.blockType))].filter(t => usable.has(t));
      return `- ${c.name}${c.kitQty > 1 ? ` x${c.kitQty}` : ''}${blocks.length ? ` (blocks: ${blocks.join(', ')})` : ' (no block yet: do not use)'}${c.notes ? `. ${c.notes.replace(/\s+/g, ' ')}` : ''}`;
    });
  const inComponents = new Set(components.flatMap(c => c.links.map(l => l.blockType)));
  const kitExtras = [
    ...kitComponents,
    ...published
      .map(b => profileOf.get(b.type))
      .filter((p): p is IAiBlockProfile => !!p?.inKit && !!p.kitName && !inComponents.has(p.blockType))
      .map(p => `- ${p.kitName} (${p.blockType})`)
  ];
  const blocks = new Map<string, CatalogBlock>();
  for (const b of [...BUILTINS, ...IOT, ...published]) blocks.set(b.type, b);
  const promptText = [
    '## Control blocks',
    ...BUILTINS.map(describe),
    '',
    '## IoT Studio blocks',
    ...IOT.map(describe),
    '',
    '## Hardware and tool blocks',
    ...published.map(describe),
    ...(kitExtras.length
      ? ['', "## The kit's components (use these counts: do not use more of a part than the kit has)", ...kitExtras]
      : [])
  ].join('\n');
  const catalog = { blocks, text: promptText };
  cached = { at: Date.now(), catalog };
  return catalog;
};
