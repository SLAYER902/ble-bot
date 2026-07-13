import { type Guild } from 'discord.js';

import type { BackupChannel, BackupResources } from './types.js';

const channelSnapshot = (channel: {
  id: string;
  type: number;
  name: string;
  parentId: string | null;
  position: number;
  nsfw?: boolean;
  rateLimitPerUser?: number | null;
  topic?: string | null;
  permissionOverwrites: {
    cache: ReadonlyMap<
      string,
      { id: string; type: number; allow: { bitfield: bigint }; deny: { bitfield: bigint } }
    >;
  };
}): BackupChannel => ({
  id: channel.id,
  type: channel.type,
  name: channel.name,
  parentId: channel.parentId,
  position: channel.position,
  ...(channel.topic !== undefined ? { topic: channel.topic } : {}),
  nsfw: channel.nsfw ?? false,
  rateLimitPerUser: channel.rateLimitPerUser ?? 0,
  permissionOverwrites: [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type === 0 ? 'role' : 'member',
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString()
  }))
});

export class DiscordSnapshotProvider {
  public async capture(guild: Guild): Promise<BackupResources> {
    const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
    return {
      guild: {
        name: guild.name,
        ...(guild.description !== undefined ? { description: guild.description } : {}),
        verificationLevel: guild.verificationLevel,
        defaultMessageNotifications: guild.defaultMessageNotifications
      },
      roles: [...roles.values()]
        .filter((role): role is NonNullable<typeof role> => role !== null)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          permissions: role.permissions.bitfield.toString(),
          position: role.position,
          managed: role.managed
        }))
        .sort((left, right) => left.position - right.position),
      channels: [...channels.values()]
        .filter((channel): channel is NonNullable<typeof channel> => channel !== null)
        .map((channel) => channelSnapshot(channel))
        .sort((left, right) => left.position - right.position),
      settings: {}
    };
  }
}
