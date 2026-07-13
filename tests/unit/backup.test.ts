import { describe, expect, it } from 'vitest';

import { createRestorePlan } from '../../src/features/backup/backup-diff.js';
import { checksumResources, verifyBackup } from '../../src/features/backup/backup-integrity.js';
import type { BackupResources, GuildBackup } from '../../src/features/backup/types.js';

const resources: BackupResources = {
  guild: { name: 'Test', verificationLevel: 1, defaultMessageNotifications: 0 },
  roles: [{ id: '1', name: 'Moderator', color: 1, permissions: '8', position: 1, managed: false }],
  channels: [
    {
      id: '2',
      type: 0,
      name: 'general',
      parentId: null,
      position: 1,
      nsfw: false,
      rateLimitPerUser: 0,
      permissionOverwrites: []
    }
  ],
  settings: {}
};

const backup = (): GuildBackup => ({
  schemaVersion: 1,
  backupId: 'backup-1',
  guildId: 'guild-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  trigger: 'manual',
  checksum: checksumResources(resources),
  encrypted: false,
  resources
});

describe('BLE Backup integrity and restore planning', () => {
  it('produces stable checksums and verifies valid backup data', () => {
    expect(checksumResources(resources)).toBe(checksumResources({ ...resources, settings: {} }));
    expect(() => verifyBackup(backup())).not.toThrow();
  });

  it('rejects altered data and plans only necessary changes', () => {
    const altered = { ...backup(), checksum: 'not-a-valid-checksum' };
    expect(() => verifyBackup(altered)).toThrow('checksum');
    const plan = createRestorePlan(backup(), { ...resources, roles: [], channels: [] });
    expect(plan.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'create', resourceType: 'role' }),
        expect.objectContaining({ kind: 'create', resourceType: 'channel' })
      ])
    );
  });
});
