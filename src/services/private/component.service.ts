import Block from '../../models/block.model';
import Component, { COMPONENT_CATEGORIES, COMPONENT_INTERFACES, type IComponent, type IComponentLink } from '../../models/component.model';
import type { IAiPartWiring } from '../../models/ai-block-profile.model';
import ErrorHandler from '../../utils/error-handler';
import { ART_KINDS, checkProfile } from './ai-profile.service';
import { resetCatalog } from '../public/ai/catalog';

// Admin > Components: the kit's components and the blocks that drive them.

const KEY = /^[a-z][a-z0-9_]{1,39}$/;
const MAX_PINS = 8;

/** A wiring's name inside a block (the same as the editor's wiringKey). */
export const wiringKey = (w: IAiPartWiring): string =>
  w.kind === 'gpio' ? `gpio:${(w.bindings ?? []).join(',')}` : w.kind === 'fixed' ? `fixed:${w.conn}` : w.kind === 'i2c' ? 'i2c' : `${w.kind}:${w.binding}`;

type RawBlock = Parameters<typeof checkProfile>[0];
export type ComponentInput = Partial<Omit<IComponent, 'links'>> & { links?: unknown };

let cache: { at: number; list: IComponent[] } | null = null;
const changed = () => {
  cache = null;
  // The AI builder's prompt lists the kit
  resetCatalog();
};

export const listComponents = async (): Promise<IComponent[]> => {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  const list = (await Component.find().sort({ category: 1, name: 1 }).lean()) as IComponent[];
  cache = { at: Date.now(), list };
  return list;
};

/** Checks one component. Links are checked against the real blocks. */
const check = async (key: string, input: ComponentInput, others: IComponent[]): Promise<{ doc: Omit<IComponent, 'updatedBy'>; errors: string[] }> => {
  const errors: string[] = [];
  if (!KEY.test(key)) errors.push('The key must be 2 to 40 small letters, digits or _, starting with a letter.');
  const name = String(input.name ?? '').trim();
  if (!name) errors.push('Give the component a name.');
  const category = String(input.category ?? 'sensor');
  if (!(COMPONENT_CATEGORIES as readonly string[]).includes(category)) errors.push(`Category must be one of ${COMPONENT_CATEGORIES.join(', ')}.`);
  const iface = String(input.interface ?? 'jst4');
  if (!(COMPONENT_INTERFACES as readonly string[]).includes(iface)) errors.push(`The connector must be one of ${COMPONENT_INTERFACES.join(', ')}.`);
  const art = String(input.art ?? 'wire');
  if (!(ART_KINDS as readonly string[]).includes(art)) errors.push('Pick one of the drawings.');
  const pins = (Array.isArray(input.pins) ? input.pins : [])
    .map(p => ({ name: String((p as { name?: unknown })?.name ?? '').trim().slice(0, 20) }))
    .filter(p => p.name);
  if (pins.length > MAX_PINS) errors.push(`A component has at most ${MAX_PINS} signal pins.`);
  if (new Set(pins.map(p => p.name.toLowerCase())).size !== pins.length) errors.push('Two pins have the same name.');
  // The connector limits the signal pins: a 4-pin JST carries 2, a 5-pin JST 3
  const max = { jst4: 2, jst5: 3, i2c: 2, servo: 1, motor: 2, neopixel: 1 }[iface];
  const label = { jst4: '4-pin JST cable', jst5: '5-pin JST cable', i2c: 'I2C cable', servo: 'servo plug', motor: 'motor plug', neopixel: 'NeoPixel plug' }[iface];
  if (max !== undefined && pins.length > max) errors.push(`A ${label} carries at most ${max} signal ${max === 1 ? 'pin' : 'pins'}; this has ${pins.length}.`);

  // Links: the block must exist, and the wiring must use its real settings
  const links: IComponentLink[] = [];
  const rawLinks = Array.isArray(input.links) ? (input.links as IComponentLink[]) : [];
  const types = [...new Set(rawLinks.map(l => String(l?.blockType ?? '')))].filter(Boolean);
  const blocks = (await Block.find({ type: { $in: types } }).lean()) as unknown as RawBlock[];
  const blockOf = new Map(blocks.map(b => [b.type, b]));
  const seen = new Set<string>();
  for (const l of rawLinks) {
    const blockType = String(l?.blockType ?? '');
    const block = blockOf.get(blockType);
    if (!block) {
      errors.push(`The block "${blockType}" doesn't exist. Create the block first, or remove this link.`);
      continue;
    }
    const checked = checkProfile(block, { is_hardware: true, part: { name, art: 'wire', wirings: [l.wiring] }, in_kit: false, notes: '' });
    const wiring = checked.profile.part?.wirings[0];
    if (checked.errors.length || !wiring) {
      errors.push(...checked.errors.map(e => `${blockType}: ${e.replace(/^wirings\[0\]: /, '')}`));
      continue;
    }
    const id = `${blockType}|${wiringKey(wiring)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const owner = others.find(o => o.key !== key && o.links.some(x => `${x.blockType}|${wiringKey(x.wiring)}` === id));
    if (owner) {
      errors.push(`The block "${blockType}" already uses that setting for "${owner.name}". Unlink it there first.`);
      continue;
    }
    const role = typeof l.role === 'string' && l.role.trim() ? l.role.trim().slice(0, 40) : undefined;
    links.push({ blockType, ...(role ? { role } : {}), wiring });
  }

  return {
    doc: {
      key,
      name: name.slice(0, 60),
      category: category as IComponent['category'],
      art,
      interface: iface as IComponent['interface'],
      pins,
      inKit: input.inKit !== false,
      kitQty: Math.min(99, Math.max(0, Math.round(Number(input.kitQty ?? 1)) || 0)),
      notes: String(input.notes ?? '').trim().slice(0, 400),
      links
    },
    errors
  };
};

/** Creates (isNew) or updates a component. Problems come back as a 400. */
export const saveComponent = async (key: string, input: ComponentInput, userId: string, isNew: boolean) => {
  const all = await Component.find().lean();
  const exists = all.some(c => c.key === key);
  if (isNew && exists) throw new ErrorHandler(400, `A component with the key "${key}" already exists.`, 'COMPONENT_EXISTS');
  if (!isNew && !exists) throw new ErrorHandler(404, 'Component not found', 'COMPONENT_NOT_FOUND');
  const { doc, errors } = await check(key, input, all as IComponent[]);
  if (errors.length) throw new ErrorHandler(400, errors.join(' '), 'INVALID_COMPONENT');
  const saved = await Component.findOneAndUpdate({ key }, { ...doc, updatedBy: userId }, { upsert: true, returnDocument: 'after', runValidators: true }).lean();
  changed();
  return saved;
};

export const deleteComponent = async (key: string) => {
  await Component.deleteOne({ key });
  changed();
};

/**
 * Adds many components at once (the "set up from blocks" step). Keys that
 * exist are skipped; ones with problems are reported, not saved.
 */
export const importComponents = async (list: (ComponentInput & { key?: string })[], userId: string) => {
  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { key: string; errors: string[] }[] = [];
  let all = (await Component.find().lean()) as IComponent[];
  for (const item of list.slice(0, 200)) {
    const key = String(item?.key ?? '').trim().toLowerCase();
    if (all.some(c => c.key === key)) {
      skipped.push(key);
      continue;
    }
    const { doc, errors } = await check(key, item, all);
    // A link to a block that isn't there is dropped (the component is still useful)
    const hard = errors.filter(e => !/doesn't exist/.test(e));
    if (hard.length) {
      failed.push({ key, errors: hard });
      continue;
    }
    await Component.create({ ...doc, updatedBy: userId });
    all = [...all, doc as IComponent];
    created.push(key);
  }
  changed();
  return { created, skipped, failed };
};

/**
 * Makes one component the owner of a block's wirings (the block editor's
 * "this block is for..." choice). The same wirings are unlinked elsewhere.
 */
export const linkBlock = async (key: string, blockType: string, links: { role?: string; wiring: IAiPartWiring }[], userId: string) => {
  const all = (await Component.find().lean()) as IComponent[];
  const target = all.find(c => c.key === key);
  if (!target) throw new ErrorHandler(404, "That component doesn't exist. Add it in Components first.", 'COMPONENT_NOT_FOUND');
  const keys = new Set(links.map(l => wiringKey(l.wiring)));
  const stripped = all.map(c => ({ ...c, links: c.links.filter(l => !(l.blockType === blockType && (c.key === key || keys.has(wiringKey(l.wiring))))) }));
  const next = { ...stripped.find(c => c.key === key)!, links: [...stripped.find(c => c.key === key)!.links, ...links.map(l => ({ ...l, blockType }))] };
  const { doc, errors } = await check(key, next, stripped);
  if (errors.length) throw new ErrorHandler(400, errors.join(' '), 'INVALID_COMPONENT');
  for (const c of stripped) {
    const before = all.find(x => x.key === c.key)!;
    if (c.key !== key && c.links.length !== before.links.length) await Component.updateOne({ key: c.key }, { links: c.links, updatedBy: userId });
  }
  await Component.updateOne({ key }, { links: doc.links, updatedBy: userId });
  changed();
  return (await listComponents()).find(c => c.key === key);
};

/** Removes every link to a block (it was deleted, or it is not hardware after all). */
export const unlinkBlock = async (blockType: string, userId: string) => {
  await Component.updateMany({ 'links.blockType': blockType }, { $pull: { links: { blockType } }, updatedBy: userId });
  changed();
};

export interface PartOut {
  name: string;
  art: string;
  wirings: (IAiPartWiring & { role?: string })[];
}

/** For the editor: each linked block's part (name, drawing, wirings). */
export const partsByBlock = async (): Promise<Map<string, PartOut>> => {
  const out = new Map<string, { names: string[]; art: string; wirings: (PartOut['wirings'][number] & { of: string })[] }>();
  for (const c of await listComponents()) {
    for (const l of c.links) {
      const part = out.get(l.blockType) ?? { names: [], art: c.art, wirings: [] };
      if (!part.names.includes(c.name)) part.names.push(c.name);
      const pinNames = c.pins.map(p => p.name);
      const named = l.wiring.names?.length || !pinNames.length || l.wiring.kind === 'i2c' || l.wiring.kind === 'fixed';
      part.wirings.push({ ...l.wiring, ...(named ? {} : { names: pinNames }), role: l.role, of: c.name });
      out.set(l.blockType, part);
    }
  }
  return new Map(
    [...out.entries()].map(([type, p]) => [
      type,
      {
        name: p.names.join(' + '),
        art: p.art,
        // A block that drives several components names each plug after its component
        wirings: p.wirings.map(({ of, ...w }) => ({ ...w, role: w.role ?? (p.names.length > 1 ? of : undefined) }))
      }
    ])
  );
};
