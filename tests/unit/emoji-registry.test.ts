import { describe, expect, it } from 'vitest';

import { EmojiRegistry } from '../../src/ui/emoji/emoji-registry.js';
import { Ui } from '../../src/ui/ui.js';

describe('BLE application emoji registry', () => {
  it('renders a configured application emoji in Discord format', () => {
    const registry = new EmojiRegistry({
      BLE_EMOJI_TICKET_PANEL: '828044ticket:1526337271635247124',
      BLE_EMOJI_MEMBER: '82382member:1526337279881384177'
    });

    expect(registry.format('ticketPanel')).toBe('<:828044ticket:1526337271635247124>');
    expect(registry.component('ticketPanel')).toEqual({
      id: '1526337271635247124',
      name: '828044ticket',
      animated: false
    });
    expect(registry.format('member')).toBe('<:82382member:1526337279881384177>');
  });

  it('uses text-only controls when an emoji is missing or invalid', () => {
    const registry = new EmojiRegistry({ BLE_EMOJI_TICKET_PANEL: 'invalid emoji value' });
    const ui = new Ui(registry);
    const panel = ui.ticketPanel({
      id: 'panel-id',
      name: 'BLE Support',
      description: 'Request help from the support team.',
      maxOpenPerUser: 2,
      enabled: true
    });

    expect(registry.format('ticketPanel')).toBeUndefined();
    expect(registry.status().find((status) => status.key === 'ticketPanel')).toMatchObject({
      configured: false,
      valid: false
    });
    expect(panel.components[0]?.components[0]?.toJSON()).toMatchObject({ label: 'Open ticket' });
    expect(panel.components[0]?.components[0]?.toJSON()).toMatchObject({ emoji: undefined });
  });
});
