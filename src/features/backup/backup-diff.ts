import type { BackupResources, GuildBackup, ResourceChange, RestorePlan } from './types.js';
import { verifyBackup } from './backup-integrity.js';

const equal = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const createRestorePlan = (backup: GuildBackup, current: BackupResources): RestorePlan => {
  verifyBackup(backup);
  const changes: ResourceChange[] = [];
  const currentRoles = new Map(current.roles.map((role) => [role.id, role]));
  const currentChannels = new Map(current.channels.map((channel) => [channel.id, channel]));
  for (const role of backup.resources.roles) {
    const live = currentRoles.get(role.id);
    if (!live)
      changes.push({
        kind: 'create',
        resourceType: 'role',
        resourceId: role.id,
        reason: 'Role is missing.'
      });
    else if (!equal(role, live))
      changes.push({
        kind: 'update',
        resourceType: 'role',
        resourceId: role.id,
        reason: 'Role attributes differ.'
      });
  }
  for (const channel of backup.resources.channels) {
    const live = currentChannels.get(channel.id);
    if (!live)
      changes.push({
        kind: 'create',
        resourceType: 'channel',
        resourceId: channel.id,
        reason: 'Channel is missing.'
      });
    else if (channel.parentId !== live.parentId || channel.position !== live.position)
      changes.push({
        kind: 'move',
        resourceType: 'channel',
        resourceId: channel.id,
        reason: 'Channel placement differs.'
      });
    else if (!equal(channel, live))
      changes.push({
        kind: 'update',
        resourceType: 'channel',
        resourceId: channel.id,
        reason: 'Channel attributes differ.'
      });
  }
  if (!equal(backup.resources.guild, current.guild))
    changes.push({
      kind: 'update',
      resourceType: 'guild',
      resourceId: backup.guildId,
      reason: 'Guild settings differ.'
    });
  const conflicts = changes.filter((change) => change.kind === 'conflict');
  return {
    backupId: backup.backupId,
    checksumVerified: true,
    changes,
    operationCount: changes.length,
    conflicts
  };
};
