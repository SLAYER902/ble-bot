import type { Redis } from 'ioredis';

import { RedisUnavailableError } from '../../errors/domain-error.js';

export interface SlidingWindow {
  recordAndCount(key: string, timestampMs: number, windowMs: number): Promise<number>;
  count(key: string, timestampMs: number, windowMs: number): Promise<number>;
}

const recordScript = `
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[3])
local count = redis.call('ZCARD', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return count
`;

const countScript = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[2])
return redis.call('ZCOUNT', KEYS[1], ARGV[2], '+inf')
`;

export class RedisSlidingWindow implements SlidingWindow {
  private serial = 0;

  public constructor(private readonly redis: Redis) {}

  public async recordAndCount(key: string, timestampMs: number, windowMs: number): Promise<number> {
    const member = `${timestampMs}:${++this.serial}`;
    try {
      const result = await this.redis.eval(
        recordScript,
        1,
        key,
        timestampMs,
        member,
        timestampMs - windowMs,
        windowMs
      );
      return Number(result);
    } catch (error) {
      throw new RedisUnavailableError(error instanceof Error ? error : undefined);
    }
  }

  public async count(key: string, timestampMs: number, windowMs: number): Promise<number> {
    try {
      const result = await this.redis.eval(
        countScript,
        1,
        key,
        timestampMs,
        timestampMs - windowMs
      );
      return Number(result);
    } catch (error) {
      throw new RedisUnavailableError(error instanceof Error ? error : undefined);
    }
  }
}
