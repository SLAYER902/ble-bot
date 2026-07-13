import 'dotenv/config';
import { REST, Routes } from 'discord.js';

import { ConfigurationError } from '../src/errors/domain-error.js';

const scope = process.argv.includes('--scope')
  ? process.argv[process.argv.indexOf('--scope') + 1]
  : undefined;
if (scope !== 'test')
  throw new ConfigurationError(
    'Only test command deletion is supported by this script. Use --scope test.'
  );
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_TEST_GUILD_ID;
if (!token || !clientId || !guildId)
  throw new ConfigurationError(
    'DISCORD_TOKEN, DISCORD_CLIENT_ID, and DISCORD_TEST_GUILD_ID are required.'
  );
await new REST({ version: '10' })
  .setToken(token)
  .put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
console.log('Deleted test-guild commands.');
