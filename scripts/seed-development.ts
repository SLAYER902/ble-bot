import 'dotenv/config';

import { ConfigurationError } from '../src/errors/domain-error.js';
import { loadConfig } from '../src/config/env.js';

const config = loadConfig();
if (config.environment !== 'development')
  throw new ConfigurationError(
    'Development seed operations are disabled outside NODE_ENV=development.'
  );
console.log(
  'No destructive seed data is installed. Use /setup start in a test guild to create configuration safely.'
);
