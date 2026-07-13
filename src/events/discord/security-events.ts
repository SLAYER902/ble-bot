import { ChannelType, Events, PermissionFlagsBits, type Client, type Guild } from 'discord.js';
import type { Logger } from 'pino';

import type { DiscordSecurityIngestor } from '../../features/security/discord-ingestor.js';

const isGuildChannel = (channel: object): channel is { guild: Guild } =>
  'guild' in channel && Boolean((channel as { guild?: Guild }).guild);

export const registerSecurityEvents = (
  client: Client,
  ingestor: DiscordSecurityIngestor,
  logger: Logger
): void => {
  const submit = (label: string, action: () => Promise<unknown>): void => {
    void action().catch((error: unknown) =>
      logger.error({ err: error, label }, 'Security event ingestion failed')
    );
  };
  client.on(Events.ChannelCreate, (channel) => {
    if (!isGuildChannel(channel)) return;
    submit('channel-create', () =>
      ingestor.ingest(channel.guild, {
        eventType:
          channel.type === ChannelType.GuildCategory ? 'CATEGORY_CREATED' : 'CHANNEL_CREATED',
        targetId: channel.id,
        targetType: channel.type === ChannelType.GuildCategory ? 'category' : 'channel'
      })
    );
  });
  client.on(Events.ChannelDelete, (channel) => {
    if (!isGuildChannel(channel)) return;
    submit('channel-delete', () =>
      ingestor.ingest(channel.guild, {
        eventType:
          channel.type === ChannelType.GuildCategory ? 'CATEGORY_DELETED' : 'CHANNEL_DELETED',
        targetId: channel.id,
        targetType: channel.type === ChannelType.GuildCategory ? 'category' : 'channel'
      })
    );
  });
  client.on(Events.ChannelUpdate, (_before, after) => {
    if (!isGuildChannel(after)) return;
    submit('channel-update', () =>
      ingestor.ingest(after.guild, {
        eventType:
          after.type === ChannelType.GuildCategory ? 'CATEGORY_UPDATED' : 'CHANNEL_UPDATED',
        targetId: after.id,
        targetType: after.type === ChannelType.GuildCategory ? 'category' : 'channel'
      })
    );
  });
  client.on(Events.GuildRoleCreate, (role) =>
    submit('role-create', () =>
      ingestor.ingest(role.guild, {
        eventType: 'ROLE_CREATED',
        targetId: role.id,
        targetType: 'role'
      })
    )
  );
  client.on(Events.GuildRoleDelete, (role) =>
    submit('role-delete', () =>
      ingestor.ingest(role.guild, {
        eventType: 'ROLE_DELETED',
        targetId: role.id,
        targetType: 'role'
      })
    )
  );
  client.on(Events.GuildRoleUpdate, (before, after) => {
    const eventType =
      !before.permissions.has(PermissionFlagsBits.Administrator) &&
      after.permissions.has(PermissionFlagsBits.Administrator)
        ? 'ADMINISTRATOR_GRANTED'
        : 'ROLE_UPDATED';
    submit('role-update', () =>
      ingestor.ingest(after.guild, { eventType, targetId: after.id, targetType: 'role' })
    );
  });
  client.on(Events.GuildBanAdd, (ban) =>
    submit('member-ban', () =>
      ingestor.ingest(ban.guild, {
        eventType: 'MEMBER_BANNED',
        targetId: ban.user.id,
        targetType: 'member'
      })
    )
  );
  client.on(Events.GuildUpdate, (_before, after) =>
    submit('guild-update', () =>
      ingestor.ingest(after, {
        eventType: 'GUILD_UPDATED',
        targetId: after.id,
        targetType: 'guild'
      })
    )
  );
  client.on(Events.WebhooksUpdate, (channel) => {
    if (!isGuildChannel(channel)) return;
    submit('webhook-update', () =>
      ingestor.ingest(channel.guild, {
        eventType: 'WEBHOOK_UPDATED',
        targetId: channel.id,
        targetType: 'webhook'
      })
    );
  });
  client.on(Events.GuildMemberAdd, (member) => {
    if (!member.user.bot) return;
    submit('bot-add', () =>
      ingestor.ingest(member.guild, {
        eventType: 'BOT_ADDED',
        targetId: member.user.id,
        targetType: 'member'
      })
    );
  });
  client.on(Events.GuildMemberUpdate, (before, after) => {
    if (before.communicationDisabledUntilTimestamp === after.communicationDisabledUntilTimestamp)
      return;
    if (!after.communicationDisabledUntilTimestamp) return;
    submit('member-timeout', () =>
      ingestor.ingest(after.guild, {
        eventType: 'MASS_TIMEOUT',
        targetId: after.id,
        targetType: 'member'
      })
    );
  });
};
