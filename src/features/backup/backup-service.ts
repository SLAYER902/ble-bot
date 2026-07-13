import type { Guild } from 'discord.js';

import { ResourceNotFoundError } from '../../errors/domain-error.js';
import type { LocalBackupStorage } from '../../infrastructure/storage/local-backup-storage.js';
import { createRestorePlan } from './backup-diff.js';
import { checksumResources, verifyBackup } from './backup-integrity.js';
import type { BackupRepository } from './backup-repository.js';
import type { DiscordSnapshotProvider } from './discord-snapshot-provider.js';
import type { BackupTrigger, GuildBackup, RestorePlan } from './types.js';

export class BackupService {
  public constructor(
    private readonly snapshots: DiscordSnapshotProvider,
    private readonly repository: BackupRepository,
    private readonly storage: LocalBackupStorage
  ) {}

  public async create(
    guild: Guild,
    createdBy: string,
    trigger: BackupTrigger = 'manual'
  ): Promise<GuildBackup> {
    await this.repository.ensureGuild(guild.id, guild.name);
    const resources = await this.snapshots.capture(guild);
    const backupId = crypto.randomUUID();
    const checksum = checksumResources(resources);
    const storageKey = `backups/${guild.id}/${backupId}.json`;
    const unencrypted: GuildBackup = {
      schemaVersion: 1,
      backupId,
      guildId: guild.id,
      createdAt: new Date().toISOString(),
      createdBy,
      trigger,
      checksum,
      encrypted: false,
      resources
    };
    const write = await this.storage.write(storageKey, JSON.stringify(unencrypted));
    const backup: GuildBackup = { ...unencrypted, encrypted: write.encrypted };
    if (write.encrypted) await this.storage.write(storageKey, JSON.stringify(backup));
    await this.repository.create({
      id: backupId,
      guildId: guild.id,
      checksum,
      storageKey,
      encrypted: write.encrypted,
      status: 'COMPLETE',
      createdBy,
      trigger,
      metadata: { roleCount: resources.roles.length, channelCount: resources.channels.length }
    });
    return backup;
  }

  public async inspect(guildId: string, backupId: string): Promise<GuildBackup> {
    const record = await this.repository.get(backupId, guildId);
    if (!record || record.status !== 'COMPLETE')
      throw new ResourceNotFoundError('A complete backup with that ID was not found.');
    const backup = JSON.parse(
      await this.storage.read(record.storageKey, record.encrypted)
    ) as GuildBackup;
    verifyBackup(backup);
    return backup;
  }

  public async planRestore(guild: Guild, backupId: string): Promise<RestorePlan> {
    const [backup, current] = await Promise.all([
      this.inspect(guild.id, backupId),
      this.snapshots.capture(guild)
    ]);
    return createRestorePlan(backup, current);
  }
}
