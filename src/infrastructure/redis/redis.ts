import { Redis } from 'ioredis';

import type { AppConfig } from '../../config/env.js';
import { RedisUnavailableError } from '../../errors/domain-error.js';

export class RedisClient {
  public readonly client: Redis;

  public constructor(config: AppConfig) {
    this.client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      connectionName: 'ble-bot'
    });
  }

  public async connect(): Promise<void> {
    try {
      if (this.client.status === 'wait') await this.client.connect();
    } catch (error) {
      throw new RedisUnavailableError(error instanceof Error ? error : undefined);
    }
  }

  public async isReady(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.client.quit();
  }
}
