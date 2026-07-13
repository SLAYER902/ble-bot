import type { APIApplicationCommand } from 'discord.js';

import { ValidationError } from '../../errors/domain-error.js';
import type { Command } from './types.js';

export class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  public register(command: Command): void {
    const name = command.metadata.name;
    if (this.commands.has(name))
      throw new ValidationError(`Duplicate command definition: ${name}.`);
    this.commands.set(name, command);
  }

  public get(name: string): Command | undefined {
    return this.commands.get(name);
  }
  public all(): readonly Command[] {
    return [...this.commands.values()];
  }
  public inventory(): readonly APIApplicationCommand[] {
    return this.all().map((command) => command.data.toJSON() as APIApplicationCommand);
  }
}
