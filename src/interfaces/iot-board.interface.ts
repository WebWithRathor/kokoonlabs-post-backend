import mongoose, { Document } from 'mongoose';
import type { ISealed } from '../utils/iot-crypto';
import type { IotBoardType, IotVariable } from '../utils/iot-studio';

// A student's physical board, registered in "My boards" for Kokoon IoT Studio.
// hardwareId is made once per board and never changes; IoT Studio knows the
// board by it. The MQTT credentials IoT Studio gives it are kept encrypted.

export interface IIotProgramRef {
  programId: string;
  name: string;
  version?: string;
}

export interface IIotBroker {
  host: string;
  port: number;
  tls: boolean;
}

export interface IIotBoard extends Document {
  userId: mongoose.Types.ObjectId | string;
  name: string;
  board: IotBoardType;
  hardwareId: string;
  // The ESP32 it is bound to (machine.unique_id() as lowercase hex), once known
  chipId: string | null;
  // IoT Studio's id, once the board was first flashed with the IoT blocks
  deviceId: string | null;
  studioUrl: string | null;
  // { username, password } sealed with IOT_CREDENTIALS_KEY (never sent out except to flash)
  credentials: ISealed | null;
  // From the last B1 answer: lets an unchanged flash skip B1
  topicPrefix: string | null;
  broker: IIotBroker | null;
  projectId: string | null;
  // Fingerprint of the last B1 that succeeded, and when (see upsertHash)
  syncHash: string | null;
  lastSyncedAt: Date | null;
  // What it was last flashed with (sent again when its connection is reset)
  lastProgram: IIotProgramRef | null;
  lastVariables: IotVariable[];
  lastFlashedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
