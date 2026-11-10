import Anthropic from '@anthropic-ai/sdk';
import Block from '../../models/block.model';
import AiBlockProfile, { type IAiBlockProfile, type IAiPartWiring } from '../../models/ai-block-profile.model';
import { aiConfig, aiEnabled } from '../../config/ai.config';
import ErrorHandler from '../../utils/error-handler';
import logger from '../../config/logger';
import { resetCatalog } from '../public/ai/catalog';

// "Teach the AI": Claude reads a block and proposes its profile (the part,
// how it's wired, kit, tips); an admin checks and saves it.

// Must match the editor (postkokoon src/utils/hardware/board.ts and parts.ts)
export const ART_KINDS = [
  'ldr', 'ir', 'irrx', 'touch', 'pot', 'mic', 'seg7', 'joystick', 'encoder', 'dotmatrix', 'ultrasonic', 'servo', 'motor',
  'oled', 'lcd', 'sht30', 'apds', 'imu', 'led', 'buzzer', 'npmatrix', 'npbar', 'rfid', 'soil', 'relay', 'button', 'line', 'wire'
] as const;
export const CONNECTOR_IDS = [
  'port1', 'port2', 'port3', 'port4', 'i2c1', 'i2c2', 'neopixel', 's1', 's2', 's3', 's4', 's5', 'm1', 'm2', 'm3', 'm4', 'header', 'onboard'
] as const;
const KINDS = ['ports', 'choice', 'gpio', 'pinList', 'fixed', 'i2c'] as const;

export type Proposal = Omit<IAiBlockProfile, 'updatedBy' | 'createdAt' | 'updatedAt' | 'blockVersion'>;

interface RawWidget {
  type?: string;
  binding?: string;
  label?: string;
  default?: unknown;
  options?: [string, string][];
  ports?: unknown[];
  pinCount?: number;
  pinNames?: string[];
}
interface RawBlock {
  type: string;
  title?: string;
  description?: string;
  category?: string;
  sections?: { widgets?: RawWidget[] }[];
  codegen?: string;
  declaration?: string;
  updatedAt?: Date;
}

const widgetsOf = (b: RawBlock) => (b.sections ?? []).flatMap(s => s.widgets ?? []).filter(w => w?.binding);

const strings = (v: unknown, max = 8) =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').slice(0, max).map(x => x.trim().slice(0, 40));

/** Checks a profile against the block's real settings. */
export const checkProfile = (block: RawBlock, input: unknown): { profile: Proposal; errors: string[] } => {
  const raw = (input ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const widgets = widgetsOf(block);
  const widget = (b: unknown) => widgets.find(w => w.binding === b);
  const rawPart = (raw.part ?? null) as Record<string, unknown> | null;
  const isHardware = raw.is_hardware ?? (rawPart !== null);

  let part: Proposal['part'] = null;
  if (isHardware && rawPart) {
    const art = String(rawPart.art ?? 'wire');
    if (!(ART_KINDS as readonly string[]).includes(art)) errors.push(`art must be one of ${ART_KINDS.join(', ')}.`);
    const wirings: IAiPartWiring[] = [];
    const list = Array.isArray(rawPart.wirings) ? rawPart.wirings : [];
    if (!list.length) errors.push('A hardware part needs at least one wiring.');
    list.forEach((w0, i) => {
      const w = (w0 ?? {}) as Record<string, unknown>;
      const at = `wirings[${i}]`;
      const kind = String(w.kind ?? '');
      if (!(KINDS as readonly string[]).includes(kind)) {
        errors.push(`${at}: kind must be one of ${KINDS.join(', ')}.`);
        return;
      }
      const out: IAiPartWiring = { kind: kind as IAiPartWiring['kind'] };
      if (typeof w.role === 'string' && w.role.trim()) out.role = w.role.trim().slice(0, 40);
      const names = strings(w.names);
      if (names.length) out.names = names;
      if (kind === 'ports' || kind === 'choice' || kind === 'pinList') {
        const wd = widget(w.binding);
        if (!wd) errors.push(`${at}: "${String(w.binding)}" is not a setting of this block.`);
        else out.binding = wd.binding;
        if (kind === 'ports' && wd && !(Array.isArray(wd.ports) && wd.ports.length)) {
          errors.push(`${at}: "${wd.binding}" has no ports set by an admin. Use gpio instead.`);
        }
        if (kind === 'choice') {
          const map = (w.map ?? {}) as Record<string, unknown>;
          const options = (wd?.options ?? []).map(o => String(o?.[0]));
          const clean: Record<string, string> = {};
          for (const [value, conn] of Object.entries(map)) {
            if (wd && !options.includes(value)) errors.push(`${at}: "${value}" is not an option of "${wd.binding}" (options: ${options.join(' | ')}).`);
            else if (!(CONNECTOR_IDS as readonly string[]).includes(String(conn))) errors.push(`${at}: "${String(conn)}" is not a connector.`);
            else clean[value] = String(conn);
          }
          if (!Object.keys(clean).length && !errors.length) errors.push(`${at}: map the dropdown's options to connectors.`);
          out.map = clean;
        }
        if (kind === 'pinList') {
          const count = Number(w.count);
          if (!Number.isInteger(count) || count < 1 || count > 8) errors.push(`${at}: count must be 1 to 8.`);
          else out.count = count;
        }
      } else if (kind === 'gpio') {
        const bindings = strings(w.bindings);
        if (!bindings.length) errors.push(`${at}: list the pin settings in bindings.`);
        for (const b of bindings) if (!widget(b)) errors.push(`${at}: "${b}" is not a setting of this block.`);
        out.bindings = bindings;
      } else if (kind === 'fixed') {
        const conn = String(w.conn ?? '');
        if (!(CONNECTOR_IDS as readonly string[]).includes(conn)) errors.push(`${at}: conn must be one of ${CONNECTOR_IDS.join(', ')}.`);
        out.conn = conn;
        const pins = (Array.isArray(w.pins) ? w.pins : []).map(p => p as { name?: unknown; gpio?: unknown });
        const clean = pins
          .filter(p => Number.isInteger(Number(p.gpio)) && Number(p.gpio) >= 0 && Number(p.gpio) <= 48)
          .map(p => ({ name: String(p.name ?? 'Signal').slice(0, 12), gpio: Number(p.gpio) }));
        if (clean.length !== pins.length) errors.push(`${at}: every pin needs a GPIO number from 0 to 48.`);
        if (clean.length) out.pins = clean;
      }
      wirings.push(out);
    });
    part = { name: String(rawPart.name ?? block.title ?? block.type).trim().slice(0, 40), art: (ART_KINDS as readonly string[]).includes(art) ? art : 'wire', wirings };
  }
  return {
    profile: {
      blockType: block.type,
      part,
      inKit: Boolean(raw.in_kit ?? raw.inKit),
      kitName: String(raw.kit_name ?? raw.kitName ?? '').trim().slice(0, 80),
      notes: String(raw.notes ?? '').trim().slice(0, 600)
    },
    errors
  };
};

const RULES = `You describe one block of the Kokoon block editor for the AI that builds kids' projects. Read the block (its settings and the MicroPython it generates) and call save_block_profile.

The board is the Kokoon Apollo (ESP32-S3-WROOM-1). Its connectors (id: pins in order, from the netlist):
- port1: 3V3, GND, IO4, IO5. port2: 3V3, GND, IO6, IO3 (4-pin JST, parts with 1 or 2 signal pins)
- port3: IO7, IO9, IO8, GND, 3V3. port4: IO13, IO11, IO12, GND, 3V3 (5-pin JST, parts with 3 signal pins; port4 is also SPI CS, SCK, MISO)
- i2c1, i2c2: 3V3, GND, SCL IO36, SDA IO35 (the same I2C bus)
- neopixel: 5V, GND, data IO48. Servo headers s1..s5: signal IO40, IO39, IO21, IO47, IO10 with 5.2V and GND. Motor ports m1..m4 (DRV8833 outputs): IO45/46, IO15/16, IO37/38, IO17/18
- header: the GPIO header (IO1-9, 11, 12, 13 with 3.3V and GND), for parts wired with jumper wires
- onboard: built into the board (RGB LED on IO48, buzzer on IO14, IMU on I2C IO41/42), no wires
A part's wiring must fit its connector: a 1 or 2 signal-pin part goes on port1/port2, a 3 signal-pin part on port3/port4.

is_hardware is false for blocks with no real part (logic, maths, variables, Wi-Fi, Bluetooth...). For a hardware part, describe how the block's settings pick its pins, with one wiring per thing that gets plugged in:
- ports: a GPIO pin setting (widget type "pin") that has admin ports (it stores "port:<i>"). Give its binding.
- choice: a dropdown whose options are connectors. map each option value (exactly as in the block) to a connector id, e.g. {"40": "s1", "39": "s2"}.
- gpio: plain GPIO number settings, one binding per pin, in order; names like ["Trig", "Echo"] if the pins have roles.
- pinList: one text setting holding several GPIOs ("1, 2, 3"); give count and names.
- fixed: pins written in the code itself (not settings): conn ("i2c1", "neopixel", "onboard", "header" or a port) and, for header, pins [{name, gpio}].
- i2c: the part talks over I2C (SoftI2C / I2C with scl 36, sda 35 in its code).
Two separate things plugged in (two motors) get two wirings with a role each ("Left motor").

Examples:
- LDR (pin widget "gpio" with ports): {"kind":"ports","binding":"gpio"}
- Ultrasonic (dropdown "port" with options "[4,5]", "[6,3]"): {"kind":"choice","binding":"port","map":{"[4,5]":"port1","[6,3]":"port2"}}
- 2-channel relay (pin settings in1, in2): {"kind":"gpio","bindings":["in1","in2"],"names":["IN1","IN2"]}
- OLED (SoftI2C in its code): {"kind":"i2c"}
- RFID reader (pins fixed in its code): {"kind":"fixed","conn":"header","pins":[{"name":"SCK","gpio":11},{"name":"MOSI","gpio":9}]}

art: the drawing that looks most like the part (ldr, ir, irrx, touch, pot, mic, seg7, joystick, encoder, dotmatrix, ultrasonic, servo, motor, oled, lcd, sht30, apds, imu, led, buzzer, npmatrix, npbar, rfid, soil, relay, button, line), or "wire" when none fits.
in_kit: whether the part is likely in the student kit; kit_name: how a child would call the part ("Rain sensor").
notes: 1 to 3 short tips for the builder AI: what the readings mean and their range, the variable names the block makes, units, good thresholds, and anything easy to get wrong. Do not repeat the block's description.`;

const TOOL = {
  name: 'save_block_profile',
  description: "Saves what the builder AI should know about this block.",
  input_schema: {
    type: 'object' as const,
    properties: {
      is_hardware: { type: 'boolean' },
      part: {
        type: 'object',
        description: 'Leave out when is_hardware is false.',
        properties: {
          name: { type: 'string', description: 'Short part name, e.g. "Rain sensor".' },
          art: { type: 'string', enum: [...ART_KINDS] },
          wirings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: [...KINDS] },
                binding: { type: 'string' },
                bindings: { type: 'array', items: { type: 'string' } },
                map: { type: 'object', additionalProperties: { type: 'string', enum: [...CONNECTOR_IDS] } },
                count: { type: 'integer' },
                names: { type: 'array', items: { type: 'string' } },
                role: { type: 'string' },
                conn: { type: 'string', enum: [...CONNECTOR_IDS] },
                pins: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, gpio: { type: 'integer' } }, required: ['gpio'] } }
              },
              required: ['kind']
            }
          }
        },
        required: ['name', 'art', 'wirings']
      },
      in_kit: { type: 'boolean' },
      kit_name: { type: 'string' },
      notes: { type: 'string' }
    },
    required: ['is_hardware', 'in_kit', 'notes']
  }
};

const blockForPrompt = (b: RawBlock) =>
  JSON.stringify({
    type: b.type,
    title: b.title,
    category: b.category,
    description: b.description,
    settings: widgetsOf(b).map(w => ({
      type: w.type,
      binding: w.binding,
      label: w.label,
      default: w.default,
      ...(w.options ? { options: w.options.map(o => o?.[0]) } : {}),
      ...(w.ports?.length ? { ports: w.ports, pinCount: w.pinCount ?? 1, pinNames: w.pinNames } : {})
    })),
    declaration: String(b.declaration ?? '').slice(0, 1500),
    codegen: String(b.codegen ?? '').slice(0, 1500)
  });

/** A published block (drafts aren't taught: students can't use them). */
const findBlock = async (type: string): Promise<RawBlock> => {
  const block = (await Block.findOne({ type }).lean()) as unknown as (RawBlock & { status?: string }) | null;
  if (!block) throw new ErrorHandler(404, 'Block not found', 'BLOCK_NOT_FOUND');
  if (block.status !== 'published') throw new ErrorHandler(400, 'Only published blocks can be taught. Publish the block first.', 'BLOCK_NOT_PUBLISHED');
  return block;
};

/** Asks Claude for the block's profile (checked, fixed by the model if needed). Not saved. */
export const analyzeBlock = async (type: string): Promise<{ proposal: Proposal; errors: string[] }> => {
  if (!aiEnabled() || aiConfig.fake) throw new ErrorHandler(503, 'The AI is not switched on (set ANTHROPIC_API_KEY).', 'AI_NOT_CONFIGURED');
  const block = await findBlock(type);
  const client = new Anthropic({ apiKey: aiConfig.apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `The block:\n${blockForPrompt(block)}` }];
  let last: { profile: Proposal; errors: string[] } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await client.messages
      .stream({
        model: aiConfig.model,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: RULES,
        tools: [TOOL as unknown as Anthropic.Tool],
        messages
      })
      .finalMessage();
    logger.info(`AI profile for ${type}: in=${msg.usage.input_tokens} out=${msg.usage.output_tokens} stop=${msg.stop_reason}`);
    const use = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!use) throw new ErrorHandler(502, "The AI didn't describe the block. Try again.", 'AI_FAILED');
    last = checkProfile(block, use.input);
    if (!last.errors.length) break;
    messages.push(
      { role: 'assistant', content: msg.content as Anthropic.ContentBlockParam[] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Fix these:\n- ${last.errors.join('\n- ')}` }] }
    );
  }
  return { proposal: last!.profile, errors: last!.errors };
};

// ── Saved profiles ───────────────────────────────────────────────────────

let cache: { at: number; list: IAiBlockProfile[] } | null = null;

/** Every saved profile (cached for a minute). */
export const getProfiles = async (): Promise<IAiBlockProfile[]> => {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  const list = (await AiBlockProfile.find().sort({ blockType: 1 }).lean()) as IAiBlockProfile[];
  cache = { at: Date.now(), list };
  return list;
};

const changed = () => {
  cache = null;
  // The builder's prompt includes the profiles
  resetCatalog();
};

/** Saves the (admin-checked) profile. Problems come back as a 400 with the list. */
export const saveProfile = async (type: string, input: unknown, userId: string) => {
  const block = await findBlock(type);
  const { profile, errors } = checkProfile(block, input);
  if (errors.length) throw new ErrorHandler(400, errors.join(' '), 'INVALID_PROFILE');
  const saved = await AiBlockProfile.findOneAndUpdate(
    { blockType: type },
    { ...profile, blockVersion: block.updatedAt ?? null, updatedBy: userId },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean();
  changed();
  return saved;
};

/**
 * Reads the block with Claude and saves the profile when it passes the
 * checks ("Teach all", and saving a block with "update the AI"). A proposal
 * with problems is not saved: an admin looks at it in "Teach the AI".
 */
export const teachBlock = async (type: string, userId: string) => {
  const { proposal, errors } = await analyzeBlock(type);
  if (errors.length) return { saved: false, errors, profile: null };
  const profile = await saveProfile(type, proposal, userId);
  return { saved: true, errors: [], profile };
};

export const deleteProfile = async (type: string) => {
  await AiBlockProfile.deleteOne({ blockType: type });
  changed();
};
