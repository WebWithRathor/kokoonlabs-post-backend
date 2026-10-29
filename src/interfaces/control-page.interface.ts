import mongoose, { Document } from 'mongoose';

// A student's control page: the phone / tablet / computer page they design
// in the editor for a Bluetooth or WiFi block. Kept in their library (shown
// on the profile) and connected to one project at most; a copy can be
// connected to another project.
export type ControlPageKind = 'bluetooth' | 'wifi';
export const CONTROL_PAGE_KINDS: ControlPageKind[] = ['bluetooth', 'wifi'];

export type ControlWidgetType =
  | 'value'
  | 'gauge'
  | 'chart'
  | 'led'
  | 'button'
  | 'switch'
  | 'slider'
  | 'dpad'
  | 'number'
  | 'text'
  | 'label';

/** What a control sets its variable to (only what isn't the default). */
export interface IControlActions {
  on?: string;
  off?: string;
  dirs?: string[];
  step?: number;
}

export interface IControlBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The page as the editor edits it (tablet / phone boxes only when placed by hand). */
export interface IControlPageLayout {
  title: string;
  theme: 'dark' | 'light';
  accent: string;
  widgets: {
    i: string;
    t: ControlWidgetType;
    n: string;
    l: string;
    u: string;
    min: number;
    max: number;
    c: string;
    a?: IControlActions;
    pos: { desktop: IControlBox; tablet?: IControlBox; phone?: IControlBox };
  }[];
}

/** The page laid out for computer, tablet and phone ([x, y, w, h] each): what the phone draws. */
export interface IResolvedControlPage {
  title: string;
  th: 'dark' | 'light';
  a: string;
  w: {
    t: ControlWidgetType;
    n: string;
    l: string;
    u: string;
    min: number;
    max: number;
    c: string;
    act?: IControlActions;
    p: [number, number, number, number][];
  }[];
}

export interface IControlPage extends Document {
  userId: mongoose.Types.ObjectId | string;
  name: string;
  kind: ControlPageKind;
  layout: IControlPageLayout;
  projectId: mongoose.Types.ObjectId | string | null;
  createdAt: Date;
  updatedAt: Date;
}
