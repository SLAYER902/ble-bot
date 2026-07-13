import { createHash } from 'node:crypto';

import { BackupIntegrityError } from '../../errors/domain-error.js';
import type { BackupResources, GuildBackup } from './types.js';

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)])
    );
  }
  return value;
};

export const checksumResources = (resources: BackupResources): string =>
  createHash('sha256')
    .update(JSON.stringify(normalize(resources)))
    .digest('hex');

export const verifyBackup = (backup: GuildBackup): void => {
  if (backup.schemaVersion !== 1)
    throw new BackupIntegrityError('This backup schema version is not supported.');
  if (checksumResources(backup.resources) !== backup.checksum)
    throw new BackupIntegrityError('Backup checksum verification failed.');
};
