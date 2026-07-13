import type { Interaction } from 'discord.js';

import type { ComponentHandler } from '../../commands/framework/component-handler.js';
import { PermissionDeniedError, ValidationError } from '../../errors/domain-error.js';
import type { PremiumService } from '../premium/premium-service.js';
import type { Ui } from '../../ui/ui.js';
import type { MusicLoopMode } from './types.js';
import type { MusicService } from './music-service.js';

const nextLoopMode = (current: MusicLoopMode): MusicLoopMode =>
  current === 'OFF' ? 'TRACK' : current === 'TRACK' ? 'QUEUE' : 'OFF';

export class MusicInteractionHandler implements ComponentHandler {
  public constructor(
    private readonly music: MusicService,
    private readonly premium: PremiumService,
    private readonly ui: Ui
  ) {}

  public canHandle(interaction: Interaction): boolean {
    if (!(
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isModalSubmit()
    ))
      return false;
    return interaction.customId.startsWith('ble:music:');
  }

  public async handle(interaction: Interaction): Promise<void> {
    if (!(
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isModalSubmit()
    ))
      return;
    if (!interaction.inGuild() || !interaction.guild)
      throw new PermissionDeniedError('BLE Music controls can only be used in a server.');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const parts = interaction.customId.split(':');
    const action = parts[2];
    const encodedGuildId = parts[3];

    if (interaction.isStringSelectMenu() && action === 'search') {
      const searchId = encodedGuildId;
      if (!searchId) throw new ValidationError('This music search is invalid.');
      const index = Number(interaction.values[0]);
      if (!Number.isInteger(index)) throw new ValidationError('Choose a valid music result.');
      await interaction.deferUpdate();
      const hadController = this.music.hasController(interaction.guild.id);
      const status = await this.premium.status(interaction.guild.id);
      const view = await this.music.selectSearch(
        searchId,
        interaction.guild,
        member,
        index,
        status
      );
      await interaction.editReply({
        embeds: [this.ui.success('Music selection saved', view.note ?? 'Track queued.')],
        components: []
      });
      if (!hadController) {
        const message = await interaction.followUp({
          ...this.ui.musicController(view),
          fetchReply: true,
          allowedMentions: { parse: [] }
        });
        await this.music.setController(interaction.guild.id, {
          channelId: message.channelId,
          messageId: message.id
        });
      }
      return;
    }

    if (!action || !encodedGuildId || encodedGuildId !== interaction.guild.id)
      throw new ValidationError('This music control does not belong to this server.');

    if (interaction.isModalSubmit() && action === 'volume-submit') {
      const value = interaction.fields.getTextInputValue('volume').trim();
      if (!/^\d{1,3}$/u.test(value))
        throw new ValidationError('Use a whole-number volume from 0 to 200.');
      const view = await this.music.setVolume(interaction.guild.id, member, Number(value));
      await interaction.reply({
        embeds: [this.ui.success('BLE Music volume updated', view.note ?? 'Volume updated.')],
        ephemeral: true
      });
      return;
    }

    if (!interaction.isButton()) return;
    if (action === 'queue') {
      const queue = this.music.getQueue(interaction.guild.id);
      await interaction.reply({
        embeds: [
          this.ui.page('info', {
            title: this.ui.labeled('BLE Music queue', 'queue'),
            description: queue.length
              ? queue
                  .slice(0, 10)
                  .map((track, index) => `${index + 1}. ${track.title} — ${track.author}`)
                  .join('\n')
              : 'There are no upcoming tracks.'
          })
        ],
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
      return;
    }
    if (action === 'volume') {
      await interaction.showModal(this.ui.musicVolumeModal(interaction.guild.id));
      return;
    }
    await interaction.deferUpdate();
    if (action === 'previous') await this.music.previous(interaction.guild.id, member);
    else if (action === 'pause') await this.music.pause(interaction.guild.id, member);
    else if (action === 'resume') await this.music.resume(interaction.guild.id, member);
    else if (action === 'skip') await this.music.skip(interaction.guild.id, member);
    else if (action === 'stop') await this.music.stop(interaction.guild.id, member);
    else if (action === 'shuffle') await this.music.shuffle(interaction.guild.id, member);
    else if (action === 'disconnect') await this.music.disconnect(interaction.guild.id, member);
    else if (action === 'loop') {
      const view = this.music.getView(interaction.guild.id);
      await this.music.setLoop(interaction.guild.id, member, nextLoopMode(view.loop));
    } else throw new ValidationError('Unknown BLE Music control.');
  }
}
