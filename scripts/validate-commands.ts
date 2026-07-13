import 'dotenv/config';

import { ValidationError } from '../src/errors/domain-error.js';
import { commandsForScripts } from './command-registry.js';

const commands = commandsForScripts().all();
const names = new Set<string>();
for (const command of commands) {
  if (names.has(command.metadata.name))
    throw new ValidationError(`Duplicate command ${command.metadata.name}.`);
  if (command.metadata.name.length === 0 || command.metadata.name.length > 32)
    throw new ValidationError(`Invalid command name ${command.metadata.name}.`);
  names.add(command.metadata.name);
}
console.log(`Validated ${commands.length} command families.`);
