import type { Client, Interaction } from 'discord.js';
import type { Logger } from 'pino';

import type { AppConfig } from '../../config/env.js';
import { isDomainError, PermissionDeniedError } from '../../errors/domain-error.js';
import type { Metrics } from '../../infrastructure/metrics/metrics.js';
import type { Ui } from '../../ui/ui.js';
import type { CommandRegistry } from './registry.js';

export class InteractionRouter {
  public constructor(
    private readonly registry: CommandRegistry,
    private readonly config: AppConfig,
    private readonly ui: Ui,
    private readonly logger: Logger,
    private readonly metrics: Metrics
  ) {}

  public attach(client: Client): void {
    client.on('interactionCreate', (interaction) => {
      void this.route(interaction);
    });
  }

  private async route(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    const command = this.registry.get(interaction.commandName);
    if (!command) return;
    const traceId = crypto.randomUUID();
    const stop = this.metrics.interactionDuration.startTimer({ command: command.metadata.name });
    try {
      if (command.metadata.guildOnly && !interaction.inGuild())
        throw new PermissionDeniedError('This command can only be used in a server.');
      if (command.metadata.ownerOnly && !this.config.discord.ownerIds.has(interaction.user.id)) {
        throw new PermissionDeniedError('This command is limited to configured BLE Bot owners.');
      }
      if (
        command.metadata.requiredUserPermissions.length > 0 &&
        !interaction.memberPermissions?.has(command.metadata.requiredUserPermissions)
      ) {
        throw new PermissionDeniedError(
          'You do not have the required Discord permission for this command.'
        );
      }
      await command.execute({ interaction, traceId });
      this.metrics.commandExecutions.inc({ command: command.metadata.name, outcome: 'success' });
    } catch (error) {
      this.metrics.commandExecutions.inc({ command: command.metadata.name, outcome: 'error' });
      this.logger.error(
        { traceId, command: command.metadata.name, err: error },
        'Interaction failed'
      );
      const description = isDomainError(error)
        ? error.safeMessage
        : `BLE Bot could not complete this request. Reference: ${traceId}`;
      const payload = {
        embeds: [this.ui.error('Action not completed', description)],
        ephemeral: true
      };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
        else await interaction.reply(payload);
      } catch (replyError) {
        this.logger.warn({ traceId, err: replyError }, 'Unable to send interaction error response');
      }
    } finally {
      stop();
    }
  }
}
