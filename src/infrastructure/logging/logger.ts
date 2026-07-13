import pino, { type Logger } from 'pino';

import type { AppConfig } from '../../config/env.js';

const redactionPaths = [
  'token',
  'authorization',
  'apiKey',
  'password',
  'secret',
  'headers.authorization',
  'req.headers.authorization'
];

export const createLogger = (config: AppConfig): Logger =>
  pino({
    level: config.logLevel,
    redact: { paths: redactionPaths, censor: '[REDACTED]' },
    ...(config.environment === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: false, singleLine: true } } }
      : {})
  });
