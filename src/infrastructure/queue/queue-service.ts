import { Queue, QueueEvents, UnrecoverableError, Worker, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

export const queueNames = [
  'backup-create',
  'backup-restore',
  'incident-recovery',
  'moderation-expiration',
  'temporary-role-expiration',
  'privilege-lease-expiration',
  'ticket-auto-close',
  'giveaway-completion',
  'poll-completion',
  'reminder-delivery',
  'ai-request',
  'log-batch',
  'retention-cleanup'
] as const;
export type QueueName = (typeof queueNames)[number];
export type JobPayload = Readonly<{
  idempotencyKey: string;
  guildId?: string;
  data: Readonly<Record<string, unknown>>;
}>;

const defaultOptions: JobsOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 1_000, jitter: 0.3 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800, count: 5_000 }
};

export class QueueService {
  private readonly queues = new Map<QueueName, Queue<JobPayload>>();
  private readonly events = new Map<QueueName, QueueEvents>();

  public constructor(
    private readonly connection: Redis,
    private readonly logger: Logger
  ) {
    for (const name of queueNames) {
      this.queues.set(
        name,
        new Queue<JobPayload>(`ble:${name}`, { connection, defaultJobOptions: defaultOptions })
      );
      const events = new QueueEvents(`ble:${name}`, { connection });
      events.on('failed', ({ jobId, failedReason }) =>
        logger.error({ queue: name, jobId, failedReason }, 'Queue job failed')
      );
      this.events.set(name, events);
    }
  }

  public async enqueue(
    name: QueueName,
    payload: JobPayload,
    options: JobsOptions = {}
  ): Promise<string> {
    const queue = this.queues.get(name);
    if (!queue) throw new UnrecoverableError(`Unknown BLE queue ${name}.`);
    const job = await queue.add(name, payload, { ...options, jobId: payload.idempotencyKey });
    return job.id ?? payload.idempotencyKey;
  }

  public async cancel(name: QueueName, jobId: string): Promise<boolean> {
    const queue = this.queues.get(name);
    if (!queue) return false;
    const job = await queue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (state === 'active') return false;
    await job.remove();
    return true;
  }

  public async status(name: QueueName): Promise<Readonly<Record<string, number>>> {
    const queue = this.queues.get(name);
    if (!queue) return {};
    return queue.getJobCounts('active', 'waiting', 'delayed', 'failed', 'completed', 'paused');
  }

  public createWorker(
    name: QueueName,
    processor: (
      payload: JobPayload,
      updateProgress: (progress: number) => Promise<void>
    ) => Promise<void>
  ): Worker<JobPayload> {
    return new Worker<JobPayload>(
      `ble:${name}`,
      async (job) => {
        await processor(job.data, async (progress) => job.updateProgress(progress));
      },
      { connection: this.connection, concurrency: 2, maxStalledCount: 2 }
    );
  }

  public async close(): Promise<void> {
    await Promise.all([...this.events.values()].map((event) => event.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}
