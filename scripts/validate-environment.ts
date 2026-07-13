import 'dotenv/config';

import { loadConfig } from '../src/config/env.js';

const config = loadConfig();
console.log(
  `Environment configuration is valid for ${config.environment}. Secrets were not displayed.`
);
