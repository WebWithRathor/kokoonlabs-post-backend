import mongoose, { Schema } from 'mongoose';
import type { IAiPartWiring } from './ai-block-profile.model';

// The kit's components (sensors, displays, motors...): what each one is,
// how it plugs into the board, its signal pins, and the blocks that drive
// it. Admins manage them in Admin > Components. Blocks are not changed:
// a link says how one block's settings pick the component's pins.

export const COMPONENT_CATEGORIES = ['sensor', 'display', 'motor', 'input', 'output', 'other'] as const;
// How it plugs in: a 4-pin JST (Port 1 / 2), a 5-pin JST (Port 3 / 4), an
// I2C socket, a servo header, a motor port, the NeoPixel socket, built
// into the board, or loose pins (jumper wires on the GPIO header)
export const COMPONENT_INTERFACES = ['jst4', 'jst5', 'i2c', 'servo', 'motor', 'neopixel', 'onboard', 'pins'] as const;

export interface IComponentLink {
  blockType: string;
  // What this plug is when a block drives several ("Left motor")
  role?: string;
  wiring: IAiPartWiring;
}

export interface IComponent {
  key: string;
  name: string;
  category: (typeof COMPONENT_CATEGORIES)[number];
  art: string;
  interface: (typeof COMPONENT_INTERFACES)[number];
  // Signal pins (power and ground are not listed)
  pins: { name: string }[];
  inKit: boolean;
  kitQty: number;
  notes: string;
  links: IComponentLink[];
  updatedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const ComponentSchema = new Schema<IComponent>(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    category: { type: String, enum: COMPONENT_CATEGORIES, default: 'sensor' },
    art: { type: String, default: 'wire' },
    interface: { type: String, enum: COMPONENT_INTERFACES, default: 'jst4' },
    pins: { type: [{ _id: false, name: { type: String, trim: true, maxlength: 20 } }], default: [] },
    inKit: { type: Boolean, default: true },
    kitQty: { type: Number, default: 1, min: 0, max: 99 },
    notes: { type: String, trim: true, maxlength: 400, default: '' },
    links: { type: Schema.Types.Mixed, default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, minimize: false }
);

export const Component = mongoose.model<IComponent>('Component', ComponentSchema);
export default Component;
