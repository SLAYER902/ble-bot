import { ValidationError } from '../errors/domain-error.js';

export const sanitizeMentions = (input: string): string =>
  input.replace(/@everyone|@here|<@&?\d{17,20}>|<#\d{17,20}>/giu, '[mention removed]');

export const safeText = (input: string, maxLength: number): string => {
  const value = sanitizeMentions(input).trim();
  if (value.length === 0) throw new ValidationError('Text cannot be empty.');
  if (value.length > maxLength)
    throw new ValidationError(`Text must be ${maxLength} characters or fewer.`);
  return value;
};

const durationPattern = /^(?<amount>\d{1,6})(?<unit>s|m|h|d|w)$/iu;
export const parseDuration = (input: string, maximumMs = 1000 * 60 * 60 * 24 * 365): number => {
  const match = durationPattern.exec(input.trim());
  if (!match?.groups) throw new ValidationError('Use a duration such as 15m, 2h, or 7d.');
  const amount = Number(match.groups.amount);
  const unit = match.groups.unit;
  const multiplier =
    unit === 's'
      ? 1_000
      : unit === 'm'
        ? 60_000
        : unit === 'h'
          ? 3_600_000
          : unit === 'd'
            ? 86_400_000
            : 604_800_000;
  const result = amount * multiplier;
  if (!Number.isSafeInteger(result) || result > maximumMs)
    throw new ValidationError('The duration is outside the allowed range.');
  return result;
};
