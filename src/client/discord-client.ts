import { Client, GatewayIntentBits } from 'discord.js';

import type { AppConfig } from '../config/env.js';

export const createDiscordClient = (config: AppConfig): Client => {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates
  ];
  if (config.discord.guildMembersIntentEnabled) intents.push(GatewayIntentBits.GuildMembers);
  if (config.messageContentEnabled)
    intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
  if (config.reactionFeaturesEnabled) intents.push(GatewayIntentBits.GuildMessageReactions);
  return new Client({ intents });
};
