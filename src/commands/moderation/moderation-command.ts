import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { PermissionDeniedError } from '../../errors/domain-error.js';
import type { ModerationRepository } from '../../features/moderation/moderation-repository.js';
import type { ModerationService } from '../../features/moderation/moderation-service.js';
import { parseDuration, safeText } from '../../utils/text.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

const requirePermission = (context: CommandContext, permission: bigint): void => {
  if (!context.interaction.memberPermissions?.has(permission)) {
    throw new PermissionDeniedError(
      'You do not have the Discord permission required for this moderation action.'
    );
  }
};

export const createModerationCommand = (
  service: ModerationService,
  repository: ModerationRepository,
  ui: Ui
): Command => ({
  metadata: {
    name: 'moderation',
    category: 'moderation',
    summary: 'Create persisted moderation cases and take authorized action.',
    longDescription:
      'Warns, timeouts, kicks, bans, unbans, and case history use Discord hierarchy preflight and persist a case after the action succeeds.',
    examples: [
      '/moderation warn user:@member reason:spam',
      '/moderation timeout user:@member duration:15m reason:cooldown'
    ],
    requiredUserPermissions: [],
    requiredBotPermissions: [],
    defaultCooldownSeconds: 3,
    premiumTier: 'free',
    guildOnly: true,
    ownerOnly: false,
    hidden: false,
    dangerous: true,
    confirmationRequired: false,
    ephemeral: true
  },
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Use BLE Bot moderation.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('warn')
        .setDescription('Record a warning.')
        .addUserOption((option) =>
          option.setName('user').setDescription('Member.').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(512)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('timeout')
        .setDescription('Timeout a manageable member.')
        .addUserOption((option) =>
          option.setName('user').setDescription('Member.').setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('duration')
            .setDescription('Example: 15m or 2h.')
            .setRequired(true)
            .setMaxLength(8)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(512)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('kick')
        .setDescription('Kick a manageable member.')
        .addUserOption((option) =>
          option.setName('user').setDescription('Member.').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(512)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ban')
        .setDescription('Ban a manageable member.')
        .addUserOption((option) =>
          option.setName('user').setDescription('Member.').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(512)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unban')
        .setDescription('Remove a ban.')
        .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(512)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('history')
        .setDescription('View persisted moderation cases.')
        .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
    ),
  async execute(context: CommandContext): Promise<void> {
    const { interaction } = context;
    if (!interaction.guild)
      throw new PermissionDeniedError('This command can only be used in a server.');
    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user', true);
    if (subcommand === 'history') {
      requirePermission(context, PermissionFlagsBits.ModerateMembers);
      const cases = await repository.history(interaction.guild.id, target.id);
      const description =
        cases.length === 0
          ? 'No persisted moderation cases were found.'
          : cases
              .map(
                (entry) =>
                  `${entry.action} | ${entry.reason} | ${entry.createdAt.toISOString()} | ${entry.id}`
              )
              .join('\n');
      await interaction.reply({
        embeds: [ui.info('Moderation history', description)],
        ephemeral: true
      });
      return;
    }
    const reason = safeText(interaction.options.getString('reason', true), 512);
    let result;
    if (subcommand === 'warn') {
      requirePermission(context, PermissionFlagsBits.ModerateMembers);
      result = await service.warn(interaction.guild, target, interaction.user.id, reason);
    } else if (subcommand === 'timeout') {
      requirePermission(context, PermissionFlagsBits.ModerateMembers);
      result = await service.timeout(
        interaction.guild,
        target,
        interaction.user.id,
        parseDuration(interaction.options.getString('duration', true), 2_419_200_000),
        reason
      );
    } else if (subcommand === 'kick') {
      requirePermission(context, PermissionFlagsBits.KickMembers);
      result = await service.kick(interaction.guild, target, interaction.user.id, reason);
    } else if (subcommand === 'ban') {
      requirePermission(context, PermissionFlagsBits.BanMembers);
      result = await service.ban(interaction.guild, target, interaction.user.id, reason);
    } else {
      requirePermission(context, PermissionFlagsBits.BanMembers);
      result = await service.unban(interaction.guild, target, interaction.user.id, reason);
    }
    await interaction.reply({
      embeds: [
        ui.embed(
          'success',
          ui.labeled('Moderation case created', 'moderation'),
          `Case: ${result.id}\nAction: ${result.action}\nTarget: ${target.id}\nReason: ${result.reason}`
        )
      ],
      ephemeral: true
    });
  }
});
