export type BackupTrigger = 'manual' | 'scheduled' | 'pre-lockdown' | 'incident';
export type BackupRole = Readonly<{
  id: string;
  name: string;
  color: number;
  permissions: string;
  position: number;
  managed: boolean;
}>;
export type BackupOverwrite = Readonly<{
  id: string;
  type: 'role' | 'member';
  allow: string;
  deny: string;
}>;
export type BackupChannel = Readonly<{
  id: string;
  type: number;
  name: string;
  parentId?: string | null;
  position: number;
  topic?: string | null;
  nsfw: boolean;
  rateLimitPerUser: number;
  permissionOverwrites: readonly BackupOverwrite[];
}>;
export type BackupGuildMetadata = Readonly<{
  name: string;
  description?: string | null;
  verificationLevel: number;
  defaultMessageNotifications: number;
}>;
export type BackupResources = Readonly<{
  guild: BackupGuildMetadata;
  roles: readonly BackupRole[];
  channels: readonly BackupChannel[];
  settings: Readonly<Record<string, unknown>>;
}>;
export type GuildBackup = Readonly<{
  schemaVersion: 1;
  backupId: string;
  guildId: string;
  createdAt: string;
  createdBy: string;
  trigger: BackupTrigger;
  checksum: string;
  encrypted: boolean;
  resources: BackupResources;
}>;
export type ResourceChange = Readonly<{
  kind: 'create' | 'update' | 'move' | 'delete' | 'skip' | 'conflict';
  resourceType: 'role' | 'channel' | 'guild';
  resourceId: string;
  reason: string;
}>;
export type RestorePlan = Readonly<{
  backupId: string;
  checksumVerified: boolean;
  changes: readonly ResourceChange[];
  operationCount: number;
  conflicts: readonly ResourceChange[];
}>;
