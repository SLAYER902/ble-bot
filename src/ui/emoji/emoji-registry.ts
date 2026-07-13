export const emojiKeys = [
  'success',
  'error',
  'warning',
  'information',
  'documentation',
  'guide',
  'loading',
  'shield',
  'security',
  'incident',
  'lock',
  'unlock',
  'backup',
  'restore',
  'moderation',
  'ban',
  'kick',
  'timeout',
  'warningAction',
  'ticket',
  'claim',
  'close',
  'music',
  'play',
  'pause',
  'resume',
  'stop',
  'skip',
  'previous',
  'queue',
  'loop',
  'shuffle',
  'volume',
  'voice',
  'ai',
  'premium',
  'settings',
  'developer',
  'owner',
  'member',
  'star',
  'trophy',
  'diamond',
  'verified',
  'event',
  'crown',
  'adminYellow',
  'adminTurquoise',
  'adminPurple',
  'bot',
  'adminGreen',
  'adminRed',
  'partner',
  'adminPink',
  'booster',
  'adminLightPurple',
  'staff',
  'boost',
  'search',
  'next',
  'previousPage',
  'firstPage',
  'lastPage',
  'refresh',
  'confirm',
  'cancel',
  'user',
  'server',
  'channel',
  'role',
  'logs',
  'giveaway',
  'poll',
  'level',
  'reminder'
] as const;
export type EmojiKey = (typeof emojiKeys)[number];

export type RegisteredEmoji = Readonly<{ name: string; id: string; animated: boolean }>;
export type EmojiStatus = Readonly<{
  key: EmojiKey;
  configured: boolean;
  valid: boolean;
  available: boolean;
}>;

const environmentKey: Record<EmojiKey, string> = {
  success: 'BLE_EMOJI_SUCCESS',
  error: 'BLE_EMOJI_ERROR',
  warning: 'BLE_EMOJI_WARNING',
  information: 'BLE_EMOJI_INFORMATION',
  documentation: 'BLE_EMOJI_DOCUMENTATION',
  guide: 'BLE_EMOJI_GUIDE',
  loading: 'BLE_EMOJI_LOADING',
  shield: 'BLE_EMOJI_SHIELD',
  security: 'BLE_EMOJI_SECURITY',
  incident: 'BLE_EMOJI_INCIDENT',
  lock: 'BLE_EMOJI_LOCK',
  unlock: 'BLE_EMOJI_UNLOCK',
  backup: 'BLE_EMOJI_BACKUP',
  restore: 'BLE_EMOJI_RESTORE',
  moderation: 'BLE_EMOJI_MODERATION',
  ban: 'BLE_EMOJI_BAN',
  kick: 'BLE_EMOJI_KICK',
  timeout: 'BLE_EMOJI_TIMEOUT',
  warningAction: 'BLE_EMOJI_WARNING_ACTION',
  ticket: 'BLE_EMOJI_TICKET',
  claim: 'BLE_EMOJI_CLAIM',
  close: 'BLE_EMOJI_CLOSE',
  music: 'BLE_EMOJI_MUSIC',
  play: 'BLE_EMOJI_PLAY',
  pause: 'BLE_EMOJI_PAUSE',
  resume: 'BLE_EMOJI_RESUME',
  stop: 'BLE_EMOJI_STOP',
  skip: 'BLE_EMOJI_SKIP',
  previous: 'BLE_EMOJI_PREVIOUS',
  queue: 'BLE_EMOJI_QUEUE',
  loop: 'BLE_EMOJI_LOOP',
  shuffle: 'BLE_EMOJI_SHUFFLE',
  volume: 'BLE_EMOJI_VOLUME',
  voice: 'BLE_EMOJI_VOICE',
  ai: 'BLE_EMOJI_AI',
  premium: 'BLE_EMOJI_PREMIUM',
  settings: 'BLE_EMOJI_SETTINGS',
  developer: 'BLE_EMOJI_DEVELOPER',
  owner: 'BLE_EMOJI_OWNER',
  member: 'BLE_EMOJI_MEMBER',
  star: 'BLE_EMOJI_STAR',
  trophy: 'BLE_EMOJI_TROPHY',
  diamond: 'BLE_EMOJI_DIAMOND',
  verified: 'BLE_EMOJI_VERIFIED',
  event: 'BLE_EMOJI_EVENT',
  crown: 'BLE_EMOJI_CROWN',
  adminYellow: 'BLE_EMOJI_ADMIN_YELLOW',
  adminTurquoise: 'BLE_EMOJI_ADMIN_TURQUOISE',
  adminPurple: 'BLE_EMOJI_ADMIN_PURPLE',
  bot: 'BLE_EMOJI_BOT',
  adminGreen: 'BLE_EMOJI_ADMIN_GREEN',
  adminRed: 'BLE_EMOJI_ADMIN_RED',
  partner: 'BLE_EMOJI_PARTNER',
  adminPink: 'BLE_EMOJI_ADMIN_PINK',
  booster: 'BLE_EMOJI_BOOSTER',
  adminLightPurple: 'BLE_EMOJI_ADMIN_LIGHT_PURPLE',
  staff: 'BLE_EMOJI_STAFF',
  boost: 'BLE_EMOJI_BOOST',
  search: 'BLE_EMOJI_SEARCH',
  next: 'BLE_EMOJI_NEXT',
  previousPage: 'BLE_EMOJI_PREVIOUS_PAGE',
  firstPage: 'BLE_EMOJI_FIRST_PAGE',
  lastPage: 'BLE_EMOJI_LAST_PAGE',
  refresh: 'BLE_EMOJI_REFRESH',
  confirm: 'BLE_EMOJI_CONFIRM',
  cancel: 'BLE_EMOJI_CANCEL',
  user: 'BLE_EMOJI_USER',
  server: 'BLE_EMOJI_SERVER',
  channel: 'BLE_EMOJI_CHANNEL',
  role: 'BLE_EMOJI_ROLE',
  logs: 'BLE_EMOJI_LOGS',
  giveaway: 'BLE_EMOJI_GIVEAWAY',
  poll: 'BLE_EMOJI_POLL',
  level: 'BLE_EMOJI_LEVEL',
  reminder: 'BLE_EMOJI_REMINDER'
};

const parseEmoji = (value: string | undefined): RegisteredEmoji | undefined => {
  if (!value) return undefined;
  const match = value
    .trim()
    .match(/^<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>$|^(a?):?([A-Za-z0-9_]{2,32}):(\d{17,20})$/);
  if (!match) return undefined;
  return match[1] !== undefined
    ? { animated: match[1] === 'a', name: match[2] ?? '', id: match[3] ?? '' }
    : { animated: match[4] === 'a', name: match[5] ?? '', id: match[6] ?? '' };
};

export class EmojiRegistry {
  private readonly emojis = new Map<EmojiKey, RegisteredEmoji>();
  private readonly invalid = new Set<EmojiKey>();

  public constructor(source: NodeJS.ProcessEnv = process.env) {
    for (const key of emojiKeys) {
      const raw = source[environmentKey[key]];
      const emoji = parseEmoji(raw);
      if (emoji) this.emojis.set(key, emoji);
      else if (raw?.trim()) this.invalid.add(key);
    }
  }

  public get(key: EmojiKey): RegisteredEmoji | undefined {
    return this.emojis.get(key);
  }

  public isConfigured(key: EmojiKey): boolean {
    return this.emojis.has(key);
  }

  public format(key: EmojiKey): string | undefined {
    const emoji = this.get(key);
    return emoji ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : undefined;
  }

  public component(
    key: EmojiKey
  ): Readonly<{ id: string; name: string; animated: boolean }> | undefined {
    return this.get(key);
  }

  public button(
    key: EmojiKey
  ): Readonly<{ id: string; name: string; animated: boolean }> | undefined {
    return this.component(key);
  }

  public status(availableIds: ReadonlySet<string> = new Set()): readonly EmojiStatus[] {
    return emojiKeys.map((key) => {
      const configured = this.emojis.has(key);
      const emoji = this.emojis.get(key);
      return {
        key,
        configured,
        valid: !this.invalid.has(key),
        available: Boolean(emoji && availableIds.has(emoji.id))
      };
    });
  }
}
