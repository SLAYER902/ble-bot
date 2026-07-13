import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { EmojiKey, EmojiRegistry } from './emoji/emoji-registry.js';

const colors = {
  success: 0x57f287,
  error: 0xed4245,
  warning: 0xfee75c,
  info: 0x5865f2,
  security: 0x9b59b6
} as const;

export type UiKind = keyof typeof colors;
export type ResourceLink = Readonly<{ label: string; url: string; emoji?: EmojiKey }>;

export class Ui {
  public constructor(private readonly emojis: EmojiRegistry) {}

  public embed(kind: UiKind, title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(colors[kind])
      .setAuthor({ name: 'BLE  •  DEFENSIVE OPERATIONS' })
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: 'BLE Shield  •  Safer server operations' })
      .setTimestamp();
  }

  public success(title: string, description: string): EmbedBuilder {
    return this.embed('success', this.labeled(title, 'success'), description);
  }
  public error(title: string, description: string): EmbedBuilder {
    return this.embed('error', this.labeled(title, 'error'), description);
  }
  public warning(title: string, description: string): EmbedBuilder {
    return this.embed('warning', this.labeled(title, 'warning'), description);
  }
  public info(title: string, description: string): EmbedBuilder {
    return this.embed('info', this.labeled(title, 'information'), description);
  }
  public incident(title: string, description: string): EmbedBuilder {
    return this.embed('security', this.labeled(title, 'security'), description);
  }
  public diagnostics(title: string, description: string): EmbedBuilder {
    return this.embed('info', this.labeled(title, 'settings'), description);
  }

  public confirmation(
    customId: string,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel'
  ): ActionRowBuilder<ButtonBuilder> {
    const confirm = new ButtonBuilder()
      .setCustomId(`${customId}:confirm`)
      .setLabel(confirmLabel)
      .setStyle(ButtonStyle.Danger);
    const cancel = new ButtonBuilder()
      .setCustomId(`${customId}:cancel`)
      .setLabel(cancelLabel)
      .setStyle(ButtonStyle.Secondary);
    const confirmEmoji = this.emojis.component('confirm');
    const cancelEmoji = this.emojis.component('cancel');
    if (confirmEmoji) confirm.setEmoji(confirmEmoji);
    if (cancelEmoji) cancel.setEmoji(cancelEmoji);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel);
  }

  public resourceLinks(...links: readonly ResourceLink[]): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      links.slice(0, 5).map((link) => {
        const button = new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(link.label)
          .setURL(link.url);
        const emoji = link.emoji ? this.emojis.component(link.emoji) : undefined;
        if (emoji) button.setEmoji(emoji);
        return button;
      })
    );
  }

  public labeled(title: string, emoji: EmojiKey | undefined): string {
    const rendered = emoji ? this.emojis.format(emoji) : undefined;
    return rendered ? `${rendered} ${title}` : title;
  }
}
