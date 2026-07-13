import { type Guild, type User } from 'discord.js';

import { BotHierarchyError, PermissionDeniedError } from '../../errors/domain-error.js';
import { safeText } from '../../utils/text.js';
import type { ModerationCase, ModerationRepository } from './moderation-repository.js';

export type ModerationAction = 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN' | 'UNBAN';

export class ModerationService {
  public constructor(private readonly repository: ModerationRepository) {}

  public async warn(
    guild: Guild,
    target: User,
    moderatorId: string,
    reason: string
  ): Promise<ModerationCase> {
    return this.record(guild, target.id, moderatorId, 'WARN', reason);
  }

  public async timeout(
    guild: Guild,
    target: User,
    moderatorId: string,
    durationMs: number,
    reason: string
  ): Promise<ModerationCase> {
    const member = await this.manageableMember(guild, target.id, 'timeout');
    await member.timeout(durationMs, `BLE Bot timeout: ${safeText(reason, 512)}`);
    return this.record(
      guild,
      target.id,
      moderatorId,
      'TIMEOUT',
      reason,
      new Date(Date.now() + durationMs)
    );
  }

  public async kick(
    guild: Guild,
    target: User,
    moderatorId: string,
    reason: string
  ): Promise<ModerationCase> {
    const member = await this.manageableMember(guild, target.id, 'kick');
    await member.kick(`BLE Bot kick: ${safeText(reason, 512)}`);
    return this.record(guild, target.id, moderatorId, 'KICK', reason);
  }

  public async ban(
    guild: Guild,
    target: User,
    moderatorId: string,
    reason: string
  ): Promise<ModerationCase> {
    if (target.id === guild.ownerId)
      throw new PermissionDeniedError('The guild owner cannot be banned.');
    const member = await guild.members.fetch(target.id).catch(() => undefined);
    if (member && !member.bannable) throw new BotHierarchyError();
    await guild.members.ban(target.id, {
      reason: `BLE Bot ban: ${safeText(reason, 512)}`,
      deleteMessageSeconds: 0
    });
    return this.record(guild, target.id, moderatorId, 'BAN', reason);
  }

  public async unban(
    guild: Guild,
    target: User,
    moderatorId: string,
    reason: string
  ): Promise<ModerationCase> {
    await guild.bans.remove(target.id, `BLE Bot unban: ${safeText(reason, 512)}`);
    return this.record(guild, target.id, moderatorId, 'UNBAN', reason);
  }

  private async manageableMember(guild: Guild, userId: string, action: 'timeout' | 'kick') {
    if (userId === guild.ownerId)
      throw new PermissionDeniedError('The guild owner cannot be moderated.');
    const member = await guild.members.fetch(userId);
    if (action === 'timeout' && !member.moderatable) throw new BotHierarchyError();
    if (action === 'kick' && !member.kickable) throw new BotHierarchyError();
    return member;
  }

  private async record(
    guild: Guild,
    targetId: string,
    moderatorId: string,
    action: ModerationAction,
    reason: string,
    expiresAt?: Date
  ): Promise<ModerationCase> {
    await this.repository.ensureGuild(guild.id, guild.name);
    return this.repository.create({
      guildId: guild.id,
      targetId,
      moderatorId,
      action,
      reason: safeText(reason, 512),
      ...(expiresAt ? { expiresAt } : {})
    });
  }
}
