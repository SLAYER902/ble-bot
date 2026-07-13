import 'dotenv/config';
import { REST, Routes } from 'discord.js';

import { ConfigurationError } from '../src/errors/domain-error.js';
import { commandsForScripts } from './command-registry.js';

const scope = process.argv.includes('--scope')
  ? process.argv[process.argv.indexOf('--scope') + 1]
  : undefined;
if (scope !== 'test' && scope !== 'global')
  throw new ConfigurationError('Use --scope test or --scope global.');
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId)
  throw new ConfigurationError(
    'DISCORD_TOKEN and DISCORD_CLIENT_ID are required for command deployment.'
  );
const testGuildId = process.env.DISCORD_TEST_GUILD_ID;
if (scope === 'test' && !testGuildId)
  throw new ConfigurationError('DISCORD_TEST_GUILD_ID is required for test command deployment.');
const registry = commandsForScripts();
const commands = registry.inventory();
const rest = new REST({ version: '10' }).setToken(token);
const route =
  scope === 'test' && testGuildId
    ? Routes.applicationGuildCommands(clientId, testGuildId)
    : Routes.applicationCommands(clientId);
await rest.put(route, { body: commands });
console.log(`Deployed ${commands.length} ${scope} command families.`);
