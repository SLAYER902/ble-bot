import { describe, expect, it } from 'vitest';

import { parseDuration, sanitizeMentions } from '../../src/utils/text.js';

describe('safe text utilities', () => {
  it('removes mass and direct mentions', () => {
    expect(sanitizeMentions('hello @everyone <@123456789012345678>')).toBe(
      'hello [mention removed] [mention removed]'
    );
  });

  it('parses bounded durations', () => {
    expect(parseDuration('15m')).toBe(900_000);
    expect(() => parseDuration('five minutes')).toThrow('Use a duration');
  });
});
