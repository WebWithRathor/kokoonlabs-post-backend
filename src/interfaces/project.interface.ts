import mongoose, { Document } from 'mongoose';
import { IResolvedControlPage } from './control-page.interface';

// A project's Bluetooth page: what the editor's Bluetooth block puts on the
// phone page (short keys, the same layout the board sends). Saved with the
// project so the page opens from a public link, without the editor.
export type BtControlKind = 'button' | 'switch' | 'slider' | 'number' | 'text' | 'dpad';

export interface IBtPageLayout {
  title: string;
  shows: { n: string; l: string; u: string }[];
  controls: { n: string; l: string; k: BtControlKind; min: number; max: number }[];
  // The page the student designed, laid out for computer / tablet / phone
  page?: IResolvedControlPage;
}

export interface IProject extends Document {
  title: string;
  description?: string;
  userId: mongoose.Types.ObjectId | string;
  nodes: unknown[];
  edges: unknown[];
  code: string;
  activeNodesCount: number;
  // The Bluetooth page (null: no Bluetooth block) and its public link code,
  // made the first time there's a page and kept from then on
  btLayout?: IBtPageLayout | null;
  btCode?: string;
  createdAt: Date;
  updatedAt: Date;
}
