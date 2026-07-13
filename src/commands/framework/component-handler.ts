import type { Interaction } from 'discord.js';

export interface ComponentHandler {
  canHandle(interaction: Interaction): boolean;
  handle(interaction: Interaction): Promise<void>;
}
