import 'dotenv/config';

import { EmojiRegistry } from '../src/ui/emoji/emoji-registry.js';

const statuses = new EmojiRegistry().status();
const invalid = statuses.filter((status) => !status.valid);
const configured = statuses.filter((status) => status.configured).length;
if (invalid.length > 0)
  throw new Error(
    `Invalid BLE emoji configuration: ${invalid.map((status) => status.key).join(', ')}.`
  );
console.log(
  `Validated emoji syntax. Configured entries: ${configured}; missing entries use text-only fallbacks.`
);
