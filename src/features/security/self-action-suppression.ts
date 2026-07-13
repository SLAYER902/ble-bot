import type { Redis } from 'ioredis';

export class SelfActionSuppression {
  public constructor(
    private readonly redis: Redis,
    private readonly botUserId: string
  ) {}

  public async mark(operationId: string, fingerprint: string, ttlSeconds = 120): Promise<void> {
    await this.redis.set(this.key(fingerprint), operationId, 'EX', ttlSeconds);
  }

  public async isExpected(event: {
    actorId?: string;
    guildId: string;
    eventType: string;
    targetId?: string;
  }): Promise<boolean> {
    if (event.actorId !== this.botUserId) return false;
    const fingerprint = `${event.guildId}:${event.eventType}:${event.targetId ?? 'none'}`;
    return (await this.redis.exists(this.key(fingerprint))) === 1;
  }

  public fingerprint(guildId: string, eventType: string, targetId?: string): string {
    return `${guildId}:${eventType}:${targetId ?? 'none'}`;
  }

  private key(fingerprint: string): string {
    return `ble:security:operation:${fingerprint}`;
  }
}
