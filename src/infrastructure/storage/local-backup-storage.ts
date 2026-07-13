import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { ValidationError } from '../../errors/domain-error.js';

export class LocalBackupStorage {
  private readonly root: string;
  private readonly key: Buffer | undefined;

  public constructor(root: string, encryptionKey: string | undefined) {
    this.root = resolve(root);
    this.key = encryptionKey ? Buffer.from(encryptionKey, 'base64') : undefined;
    if (this.key && this.key.length !== 32) throw new ValidationError('ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }

  public async write(key: string, value: string): Promise<{ encrypted: boolean }> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    if (!this.key) {
      await writeFile(target, value, { encoding: 'utf8', mode: 0o600 });
      return { encrypted: false };
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    await writeFile(target, payload, { mode: 0o600 });
    return { encrypted: true };
  }

  public async read(key: string, encrypted: boolean): Promise<string> {
    const content = await readFile(this.pathFor(key));
    if (!encrypted) return content.toString('utf8');
    if (!this.key) throw new ValidationError('An encryption key is required to read this backup.');
    if (content.length < 29) throw new ValidationError('Encrypted backup payload is malformed.');
    const iv = content.subarray(0, 12);
    const tag = content.subarray(12, 28);
    const ciphertext = content.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  private pathFor(key: string): string {
    if (!/^[a-zA-Z0-9_./-]+$/u.test(key) || key.includes('..')) throw new ValidationError('Unsafe storage key.');
    const target = resolve(this.root, key);
    if (!(target === this.root || target.startsWith(`${this.root}${sep}`))) throw new ValidationError('Storage path escapes its configured root.');
    return target;
  }
}
