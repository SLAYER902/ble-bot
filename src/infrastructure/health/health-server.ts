import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import type { AppConfig } from '../../config/env.js';
import type { Metrics } from '../metrics/metrics.js';

export interface ReadinessProbe {
  readonly name: string;
  check(): Promise<boolean>;
}

export class HealthServer {
  private readonly app: FastifyInstance;

  public constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly metrics: Metrics,
    private readonly probes: readonly ReadinessProbe[]
  ) {
    this.app = Fastify({ logger: false });
    this.app.get('/healthz', () => ({ status: 'ok' }));
    this.app.get('/readyz', async (_request, reply) => {
      const results = await Promise.all(
        this.probes.map(async (probe) => ({
          name: probe.name,
          ready: await probe.check().catch(() => false)
        }))
      );
      for (const result of results)
        this.metrics.dependencyReady.set({ dependency: result.name }, result.ready ? 1 : 0);
      const ready = results.every((result) => result.ready);
      return reply
        .code(ready ? 200 : 503)
        .send({ status: ready ? 'ready' : 'degraded', dependencies: results });
    });
    this.app.get('/metrics', async (_request, reply) => {
      reply.header('content-type', this.metrics.registry.contentType);
      return this.metrics.registry.metrics();
    });
  }

  public async start(): Promise<void> {
    await this.app.listen({ host: this.config.health.host, port: this.config.health.port });
    this.logger.info(
      { host: this.config.health.host, port: this.config.health.port },
      'Health server listening'
    );
  }

  public async close(): Promise<void> {
    await this.app.close();
  }
}
