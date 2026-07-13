import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { PermissionDeniedError, ResourceNotFoundError } from '../../errors/domain-error.js';
import type { RoleService } from '../../features/roles/role-service.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

export const createRoleCommand = (service: RoleService, ui: Ui): Command => ({
  metadata: {
    name: 'role',
    category: 'management',
    summary: 'Safely assign, remove, and inspect roles.',
    longDescription:
      'Role changes check bot hierarchy, target member hierarchy, and managed-role status before calling Discord.',
    examples: ['/role add user:@member role:@verified', '/role info role:@moderator'],
    requiredUserPermissions: [PermissionFlagsBits.ManageRoles],
    requiredBotPermissions: [PermissionFlagsBits.ManageRoles],
    defaultCooldownSeconds: 3,
    premiumTier: 'free',
    guildOnly: true,
    ownerOnly: false,
    hidden: false,
    dangerous: false,
    confirmationRequired: false,
    ephemeral: true
  },
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage roles safely.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Assign a manageable role to a manageable user.')
        .addUserOption((option) =>
          option.setName('user').setDescription('Member.').setRequired(true)
        )
        .addRoleOption((option) => option.setName('role').setDescription('Role.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a manageable role from a manageable user.')
        .addUserOption((option) =>
          option.setName('user').setDescription('Member.').setRequired(true)
        )
        .addRoleOption((option) => option.setName('role').setDescription('Role.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('View role metadata.')
        .addRoleOption((option) => option.setName('role').setDescription('Role.').setRequired(true))
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    if (!interaction.guild)
      throw new PermissionDeniedError('This command can only be used in a server.');
    const requestedRole = interaction.options.getRole('role', true);
    const role = await interaction.guild.roles.fetch(requestedRole.id);
    if (!role) throw new ResourceNotFoundError('That role is no longer available.');
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'info') {
      await interaction.reply({
        embeds: [
          ui.info(
            'Role information',
            `Role: ${role.id}\nPosition: ${role.position}\nManaged by integration: ${role.managed ? 'Yes' : 'No'}\nEditable by BLE Bot: ${role.editable ? 'Yes' : 'No'}\nPermissions: ${role.permissions.bitfield.toString()}`
          )
        ],
        ephemeral: true
      });
      return;
    }
    const user = interaction.options.getUser('user', true);
    if (subcommand === 'add') await service.add(interaction.guild, user, role);
    else await service.remove(interaction.guild, user, role);
    await interaction.reply({
      embeds: [
        ui.success(
          subcommand === 'add' ? 'Role assigned' : 'Role removed',
          `Role ${role.id} was ${subcommand === 'add' ? 'assigned to' : 'removed from'} ${user.id}.`
        )
      ],
      ephemeral: true
    });
  }
});
