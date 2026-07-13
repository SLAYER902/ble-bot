export type ErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'PERMISSION_DENIED'
  | 'BOT_HIERARCHY'
  | 'DISCORD_PERMISSION'
  | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'FEATURE_DISABLED'
  | 'PREMIUM_REQUIRED'
  | 'COOLDOWN'
  | 'RATE_LIMIT'
  | 'DATABASE_UNAVAILABLE'
  | 'REDIS_UNAVAILABLE'
  | 'EXTERNAL_SERVICE'
  | 'AI_PROVIDER'
  | 'MUSIC_SERVICE'
  | 'BACKUP_INTEGRITY'
  | 'RESTORE_CONFLICT'
  | 'SECURITY_CIRCUIT_OPEN';

export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly safeMessage: string;
  public readonly details: Record<string, unknown> | undefined;

  public constructor(
    code: ErrorCode,
    safeMessage: string,
    options: { cause: Error | undefined; details: Record<string, unknown> | undefined } = {
      cause: undefined,
      details: undefined
    }
  ) {
    super(safeMessage, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.safeMessage = safeMessage;
    this.details = options.details;
  }
}

export class ConfigurationError extends DomainError {
  public constructor(message: string, details?: Record<string, unknown>) {
    super('CONFIGURATION_ERROR', message, { cause: undefined, details });
  }
}
export class PermissionDeniedError extends DomainError {
  public constructor(message = 'You are not authorized to perform this action.') {
    super('PERMISSION_DENIED', message);
  }
}
export class BotHierarchyError extends DomainError {
  public constructor(message = 'BLE Bot is below the target in the role hierarchy.') {
    super('BOT_HIERARCHY', message);
  }
}
export class DiscordPermissionError extends DomainError {
  public constructor(message: string) {
    super('DISCORD_PERMISSION', message);
  }
}
export class ResourceNotFoundError extends DomainError {
  public constructor(message: string) {
    super('RESOURCE_NOT_FOUND', message);
  }
}
export class ValidationError extends DomainError {
  public constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, { cause: undefined, details });
  }
}
export class FeatureDisabledError extends DomainError {
  public constructor(feature: string) {
    super('FEATURE_DISABLED', `${feature} is not enabled for this server.`);
  }
}
export class PremiumRequiredError extends DomainError {
  public constructor() {
    super('PREMIUM_REQUIRED', 'This feature requires a higher BLE Bot tier.');
  }
}
export class CooldownError extends DomainError {
  public constructor(retryAfterSeconds: number) {
    super('COOLDOWN', `Please wait ${retryAfterSeconds} seconds before trying again.`, {
      cause: undefined,
      details: { retryAfterSeconds }
    });
  }
}
export class RateLimitError extends DomainError {
  public constructor(message = 'This action is temporarily rate limited.') {
    super('RATE_LIMIT', message);
  }
}
export class DatabaseUnavailableError extends DomainError {
  public constructor(cause?: Error) {
    super('DATABASE_UNAVAILABLE', 'The database is temporarily unavailable.', {
      cause,
      details: undefined
    });
  }
}
export class RedisUnavailableError extends DomainError {
  public constructor(cause?: Error) {
    super('REDIS_UNAVAILABLE', 'The security coordination service is temporarily unavailable.', {
      cause,
      details: undefined
    });
  }
}
export class ExternalServiceError extends DomainError {
  public constructor(message: string, cause?: Error) {
    super('EXTERNAL_SERVICE', message, { cause, details: undefined });
  }
}
export class AIProviderError extends DomainError {
  public constructor(message: string, cause?: Error) {
    super('AI_PROVIDER', message, { cause, details: undefined });
  }
}
export class MusicServiceError extends DomainError {
  public constructor(message: string, cause?: Error) {
    super('MUSIC_SERVICE', message, { cause, details: undefined });
  }
}
export class BackupIntegrityError extends DomainError {
  public constructor(message: string) {
    super('BACKUP_INTEGRITY', message);
  }
}
export class RestoreConflictError extends DomainError {
  public constructor(message: string) {
    super('RESTORE_CONFLICT', message);
  }
}
export class SecurityCircuitOpenError extends DomainError {
  public constructor(
    message = 'BLE Shield is in degraded mode and will not take automated action.'
  ) {
    super('SECURITY_CIRCUIT_OPEN', message);
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError;
