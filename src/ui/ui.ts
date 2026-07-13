import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { EmojiKey, EmojiRegistry } from './emoji/emoji-registry.js';

const colors = {
  success: 0x2f855a,
  error: 0xc53030,
  warning: 0xb7791f,
  info: 0x2b6cb0,
  security: 0x553c9a
} as const;

export type UiKind = keyof typeof colors;

export class Ui {
  public constructor(private readonly emojis: EmojiRegistry) {}

  public embed(kind: UiKind, title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(colors[kind])
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();
  }

  public success(title: string, description: string): EmbedBuilder {
    return this.embed('success', title, description);
  }
  public error(title: string, description: string): EmbedBuilder {
    return this.embed('error', title, description);
  }
  public warning(title: string, description: string): EmbedBuilder {
    return this.embed('warning', title, description);
  }
  public info(title: string, description: string): EmbedBuilder {
    return this.embed('info', title, description);
  }
  public incident(title: string, description: string): EmbedBuilder {
    return this.embed('security', title, description);
  }
  public diagnostics(title: string, description: string): EmbedBuilder {
    return this.embed('info', title, description);
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

  public labeled(title: string, emoji: EmojiKey | undefined): string {
    const rendered = emoji ? this.emojis.format(emoji) : undefined;
    return rendered ? `${rendered} ${title}` : title;
  }
}
