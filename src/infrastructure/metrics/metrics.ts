import { Registry, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';

export class Metrics {
  public readonly registry = new Registry();
  public readonly commandExecutions = new Counter({
    name: 'ble_command_executions_total',
    help: 'Number of command executions.',
    labelNames: ['command', 'outcome'] as const,
    registers: [this.registry]
  });
  public readonly interactionDuration = new Histogram({
    name: 'ble_interaction_duration_seconds',
    help: 'Interaction processing duration in seconds.',
    labelNames: ['command'] as const,
    registers: [this.registry]
  });
  public readonly securityEvents = new Counter({
    name: 'ble_security_events_total',
    help: 'Normalized security events.',
    labelNames: ['event_type', 'source'] as const,
    registers: [this.registry]
  });
  public readonly containmentActions = new Counter({
    name: 'ble_containment_actions_total',
    help: 'Containment actions attempted.',
    labelNames: ['outcome'] as const,
    registers: [this.registry]
  });
  public readonly gatewayHeartbeat = new Gauge({
    name: 'ble_gateway_heartbeat_ms',
    help: 'Discord gateway ping in milliseconds.',
    registers: [this.registry]
  });
  public readonly dependencyReady = new Gauge({
    name: 'ble_dependency_ready',
    help: 'Dependency readiness, 1 when ready.',
    labelNames: ['dependency'] as const,
    registers: [this.registry]
  });

  public constructor(enabled = true) {
    if (enabled) collectDefaultMetrics({ register: this.registry, prefix: 'ble_' });
  }
}
