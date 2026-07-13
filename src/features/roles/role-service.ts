import { type Guild, type Role, type User } from 'discord.js';

import { BotHierarchyError, PermissionDeniedError } from '../../errors/domain-error.js';

export class RoleService {
  public async add(guild: Guild, target: User, role: Role): Promise<void> {
    const member = await this.preflight(guild, target, role);
    await member.roles.add(role, 'BLE Bot role assignment');
  }

  public async remove(guild: Guild, target: User, role: Role): Promise<void> {
    const member = await this.preflight(guild, target, role);
    await member.roles.remove(role, 'BLE Bot role removal');
  }

  private async preflight(guild: Guild, target: User, role: Role) {
    if (target.id === guild.ownerId)
      throw new PermissionDeniedError(
        'The guild owner cannot be managed through this role command.'
      );
    if (role.managed || !role.editable)
      throw new BotHierarchyError('BLE Bot cannot manage this role due to Discord role hierarchy.');
    const member = await guild.members.fetch(target.id);
    if (!member.manageable)
      throw new BotHierarchyError(
        'BLE Bot cannot manage this member due to Discord role hierarchy.'
      );
    return member;
  }
}
