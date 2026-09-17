import { Document } from 'mongoose';

export type FieldKind = 'dropdown' | 'number' | 'text';
export type BlockShape = 'statement' | 'value' | 'hat';
export type BlockStatus = 'draft' | 'published';

export enum Category {
  GENERAL = 'general',
  LOOP = 'loop',
  CONDITION = 'condition',
  GPIO = 'gpio',
  SENSOR = 'sensor',
  IOT = 'iot',
  DISPLAY = 'display',
  MOTORS = 'motors',
  COMMS = 'comms',
  LOGIC = 'logic',
  POWER = 'power',
  TOOLS = 'tools',
  MATH = 'math'
}

export interface IBlockField {
  name: string;
  kind?: FieldKind;
  options?: string[][];
  default?: string;
}

export interface IBlock extends Document {
  type: string;
  label?: string;
  fields?: IBlockField[];
  template?: string;
  title?: string;
  icon?: string;
  sections?: Record<string, any> | any;
  outputs?: any[];
  codegen?: string;
  declaration?: string;
  category?: Category | string;
  colour?: string;
  imports?: string[];
  shape?: BlockShape;
  status?: BlockStatus;
  createdAt: Date;
  updatedAt: Date;
}
