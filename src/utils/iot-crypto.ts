import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Boards' MQTT credentials are stored encrypted (AES-256-GCM, a fresh IV each
// time). The key is IOT_CREDENTIALS_KEY; the database alone can't read them.

export interface ISealed {
  iv: string; // base64, 12 bytes
  tag: string; // base64, 16 bytes
  data: string; // base64
}

export const seal = (key: Buffer, value: unknown): ISealed => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
};

/** The value back. Throws if the key is wrong or the data was changed. */
export const unseal = <T>(key: Buffer, sealed: ISealed): T => {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const text = Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(text) as T;
};
