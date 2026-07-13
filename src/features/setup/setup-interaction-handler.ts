import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type Interaction,
  type StringSelectMenuInteraction
} from 'discord.js';

import type { ComponentHandler } from '../../commands/framework/component-handler.js';
import { PermissionDeniedError, ResourceNotFoundError } from '../../errors/domain-error.js';
import type { Ui } from '../../ui/ui.js';
import type { SetupService } from './setup-service.js';

const setupPrefix = 'ble:setup:';

const setupSection = (step: number): string => {
  if (step <= 1) return 'Baseline verification';
  if (step <= 3) return 'Security posture';
  if (step <= 5) return 'Recovery and backups';
  if (step <= 8) return 'Moderation and tickets';
  if (step <= 12) return 'Community modules';
  return 'Review and completion';
};

const requireGuild = (interaction: ButtonInteraction | StringSelectMenuInteraction): Guild => {
  if (!interaction.inGuild() || !interaction.guild)
    throw new PermissionDeniedError('This setup control can only be used in a server.');
  return interaction.guild;
};

const requireManager = (interaction: ButtonInteraction | StringSelectMenuInteraction): void => {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    throw new PermissionDeniedError('Manage Server is required to use BLE Setup controls.');
};

const moduleDescriptions: Readonly<Record<string, string>> = {
  security:
    'Review `/security status`, then enable BLE Shield when the server role hierarchy is ready.',
  backups:
    'Use `/backup create` after the baseline is configured. Restore previews never modify the server.',
  moderation:
    'Review bot hierarchy before using moderation actions. BLE records successful cases for later inspection.',
  tickets:
    'Use `/ticket setup` to create a persistent support panel, then select its channels and staff roles.',
  music:
    'Music controls are intentionally not registered until a complete compliant playback source is configured.',
  voice:
    'Temporary voice controls are intentionally not registered until lifecycle cleanup is available.',
  ai: 'AI stays disabled until an OpenAI-compatible provider is configured. Existing safety and credit controls remain separate.'
};

export class SetupInteractionHandler implements ComponentHandler {
  public constructor(
    private readonly setup: SetupService,
    private readonly ui: Ui
  ) {}

  public canHandle(interaction: Interaction): boolean {
    return (
      (interaction.isButton() || interaction.isStringSelectMenu()) &&
      interaction.customId.startsWith(setupPrefix)
    );
  }

  public async handle(interaction: Interaction): Promise<void> {
    if (interaction.isButton()) {
      await this.handleButton(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) await this.handleModule(interaction);
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    const [, , action] = interaction.customId.split(':');
    const guild = requireGuild(interaction);
    requireManager(interaction);
    if (action === 'continue') {
      const current = await this.setup.status(guild.id);
      const started = current.step === 0 ? await this.setup.start(guild.id, guild.name) : current;
      const nextStep = Math.min(started.step + 1, 17);
      const progress = await this.setup.advance(guild.id, nextStep, nextStep === 17);
      await interaction.update(
        this.ui.setupControlPanel({
          ...progress,
          currentSection: setupSection(progress.step)
        })
      );
      return;
    }
    if (action === 'progress') {
      const progress = await this.setup.status(guild.id);
      await interaction.update(
        this.ui.setupControlPanel({
          ...progress,
          currentSection: setupSection(progress.step)
        })
      );
      return;
    }
    if (action === 'diagnostics') {
      const me = guild.members.me;
      const missing = [
        !me?.permissions.has(PermissionFlagsBits.ViewAuditLog) ? 'View Audit Log' : undefined,
        !me?.permissions.has(PermissionFlagsBits.ManageRoles) ? 'Manage Roles' : undefined,
        !me?.permissions.has(PermissionFlagsBits.ManageWebhooks) ? 'Manage Webhooks' : undefined
      ].filter((value): value is string => Boolean(value));
      await interaction.reply({
        embeds: [
          this.ui.diagnostics(
            'Setup diagnostics',
            missing.length
              ? `Missing bot permissions: ${missing.join(', ')}. Update the BLE Bot role, then run diagnostics again.`
              : 'Core permissions are present. Keep the BLE Bot role above every role it must manage.'
          )
        ],
        ephemeral: true
      });
      return;
    }
    if (action === 'exit') {
      await interaction.update({
        embeds: [
          this.ui.info(
            'Setup centre closed',
            'Your saved setup progress remains available through `/setup status`.'
          )
        ],
        components: []
      });
      return;
    }
    throw new ResourceNotFoundError('This setup control has expired.');
  }

  private async handleModule(interaction: StringSelectMenuInteraction): Promise<void> {
    const guild = requireGuild(interaction);
    requireManager(interaction);
    const selected = interaction.values[0];
    if (!selected || !moduleDescriptions[selected])
      throw new ResourceNotFoundError('This setup module is no longer available.');
    const progress = await this.setup.status(guild.id);
    await interaction.reply({
      embeds: [
        this.ui.page('info', {
          title: this.ui.labeled(`Setup module: ${selected}`, 'guide'),
          description: moduleDescriptions[selected],
          fields: [
            { name: 'Current setup section', value: setupSection(progress.step), inline: true },
            { name: 'Saved progress', value: `${progress.step} of 17`, inline: true }
          ]
        })
      ],
      ephemeral: true
    });
  }
}
