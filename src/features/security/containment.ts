import { PermissionFlagsBits, type Guild } from 'discord.js';

import { BotHierarchyError, DiscordPermissionError } from '../../errors/domain-error.js';
import type { SecurityEvent } from './types.js';

export type ContainmentAction = Readonly<{
  type: 'REMOVE_DANGEROUS_ROLE' | 'REMOVE_WEBHOOK' | 'QUARANTINE_BOT' | 'NO_ACTION';
  success: boolean;
  detail: string;
}>;

export interface ContainmentExecutor {
  contain(event: SecurityEvent, operationId: string): Promise<readonly ContainmentAction[]>;
}

export class NoopContainmentExecutor implements ContainmentExecutor {
  public contain(): Promise<readonly ContainmentAction[]> {
    return Promise.resolve([
      { type: 'NO_ACTION', success: false, detail: 'No Discord containment executor is available.' }
    ]);
  }
}

/**
 * Executes only narrow, attributable actions. It never bans an actor, touches the owner,
 * or applies bulk permission overwrites.
 */
export class DiscordContainmentExecutor implements ContainmentExecutor {
  public constructor(private readonly resolveGuild: (guildId: string) => Guild | undefined) {}

  public async contain(
    event: SecurityEvent,
    operationId: string
  ): Promise<readonly ContainmentAction[]> {
    if (!event.actorId)
      return [{ type: 'NO_ACTION', success: false, detail: 'Actor is unresolved.' }];
    const guild = this.resolveGuild(event.guildId);
    if (!guild)
      return [{ type: 'NO_ACTION', success: false, detail: 'Guild is not available in cache.' }];
    if (event.actorId === guild.ownerId)
      return [
        { type: 'NO_ACTION', success: false, detail: 'Guild owner is never auto-contained.' }
      ];

    const reason = `BLE Shield containment ${operationId}`;
    if (event.eventType === 'WEBHOOK_CREATED' || event.eventType === 'WEBHOOK_UPDATED') {
      const webhooks = await guild.fetchWebhooks();
      const webhook = event.targetId ? webhooks.get(event.targetId) : undefined;
      if (!webhook)
        return [{ type: 'NO_ACTION', success: false, detail: 'Target webhook was not found.' }];
      try {
        await webhook.delete(reason);
      } catch {
        throw new DiscordPermissionError('BLE Bot cannot remove the detected webhook.');
      }
      return [{ type: 'REMOVE_WEBHOOK', success: true, detail: `Removed webhook ${webhook.id}.` }];
    }

    if (
      event.targetType === 'role' &&
      event.targetId &&
      event.eventType === 'ADMINISTRATOR_GRANTED'
    ) {
      const [member, role] = await Promise.all([
        guild.members.fetch(event.actorId),
        guild.roles.fetch(event.targetId)
      ]);
      if (!role)
        return [{ type: 'NO_ACTION', success: false, detail: 'Target role was not found.' }];
      if (!member.manageable || !role.editable) throw new BotHierarchyError();
      if (!role.permissions.has(PermissionFlagsBits.Administrator)) {
        return [
          {
            type: 'NO_ACTION',
            success: false,
            detail: 'The target role is no longer administrator-level.'
          }
        ];
      }
      await member.roles.remove(role, reason);
      return [
        {
          type: 'REMOVE_DANGEROUS_ROLE',
          success: true,
          detail: `Removed role ${role.id} from the actor.`
        }
      ];
    }

    return [
      { type: 'NO_ACTION', success: false, detail: 'No safe automatic action matches this event.' }
    ];
  }
}
