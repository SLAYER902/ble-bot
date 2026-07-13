import { describe, expect, it } from 'vitest';

import { EmojiRegistry } from '../../src/ui/emoji/emoji-registry.js';
import { Ui } from '../../src/ui/ui.js';

describe('BLE application emoji registry', () => {
  it('renders a configured application emoji in Discord format', () => {
    const registry = new EmojiRegistry({ BLE_EMOJI_TICKET: 'bleticket:1526317462495166494' });

    expect(registry.format('ticket')).toBe('<:bleticket:1526317462495166494>');
    expect(registry.component('ticket')).toEqual({
      id: '1526317462495166494',
      name: 'bleticket',
      animated: false
    });
  });

  it('uses text-only controls when an emoji is missing or invalid', () => {
    const registry = new EmojiRegistry({ BLE_EMOJI_TICKET: 'invalid emoji value' });
    const ui = new Ui(registry);
    const panel = ui.ticketPanel({
      id: 'panel-id',
      name: 'BLE Support',
      description: 'Request help from the support team.',
      maxOpenPerUser: 2,
      enabled: true
    });

    expect(registry.format('ticket')).toBeUndefined();
    expect(registry.status().find((status) => status.key === 'ticket')).toMatchObject({
      configured: false,
      valid: false
    });
    expect(panel.components[0]?.components[0]?.toJSON()).toMatchObject({ label: 'Open ticket' });
    expect(panel.components[0]?.components[0]?.toJSON()).toMatchObject({ emoji: undefined });
  });
});
