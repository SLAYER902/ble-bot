import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { ResourceNotFoundError } from '../../errors/domain-error.js';
import type { PremiumService } from '../../features/premium/premium-service.js';
import type { MusicService } from '../../features/music/music-service.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

const loopMode = (value: string): 'OFF' | 'TRACK' | 'QUEUE' =>
  value === 'track' ? 'TRACK' : value === 'queue' ? 'QUEUE' : 'OFF';

export const createMusicCommand = (
  music: MusicService,
  premium: PremiumService,
  ui: Ui
): Command => ({
  metadata: {
    name: 'music',
    category: 'music',
    summary: 'Search, play, and control BLE Music in your voice channel.',
    longDescription:
      'Uses Lavalink-backed playback with a persistent controller, queue controls, and automatic empty-channel and idle cleanup.',
    examples: ['/music play query:lofi hip hop', '/music queue', '/music controller'],
    requiredUserPermissions: [],
    requiredBotPermissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    defaultCooldownSeconds: 3,
    premiumTier: 'free',
    guildOnly: true,
    ownerOnly: false,
    hidden: false,
    dangerous: false,
    confirmationRequired: false
  },
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Play and control BLE Music.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('play')
        .setDescription('Search for a track and choose a result.')
        .addStringOption((option) =>
          option
            .setName('query')
            .setDescription('Track name or direct audio URL.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('search')
        .setDescription('Search without immediately changing playback.')
        .addStringOption((option) =>
          option
            .setName('query')
            .setDescription('Track name or direct audio URL.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('pause').setDescription('Pause current playback.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('resume').setDescription('Resume current playback.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('stop').setDescription('Stop playback and disconnect BLE Music.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('skip').setDescription('Skip to the next track.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('previous').setDescription('Return to the previous track.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('queue').setDescription('View the music queue.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('now-playing').setDescription('View the current player status.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('seek')
        .setDescription('Move to a position in the current track.')
        .addIntegerOption((option) =>
          option
            .setName('seconds')
            .setDescription('Position in seconds.')
            .setRequired(true)
            .setMinValue(0)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('volume')
        .setDescription('Set volume from 0 to 200.')
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('Volume percentage.')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(200)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('loop')
        .setDescription('Choose music loop mode.')
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Loop mode.')
            .setRequired(true)
            .addChoices(
              { name: 'Off', value: 'off' },
              { name: 'Track', value: 'track' },
              { name: 'Queue', value: 'queue' }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('shuffle').setDescription('Shuffle upcoming tracks.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a queued track by position.')
        .addIntegerOption((option) =>
          option
            .setName('position')
            .setDescription('Queue position.')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('move')
        .setDescription('Move a queued track.')
        .addIntegerOption((option) =>
          option
            .setName('from')
            .setDescription('Current queue position.')
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption((option) =>
          option
            .setName('to')
            .setDescription('New queue position.')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('clear').setDescription('Clear upcoming tracks.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disconnect').setDescription('Disconnect BLE Music from voice.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('controller')
        .setDescription('Create or locate the persistent music controller.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('settings').setDescription('View music cleanup and queue settings.')
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;
    const member = await guild.members.fetch(interaction.user.id);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'play' || subcommand === 'search') {
      await interaction.deferReply({ ephemeral: true });
      const search = await music.prepareSearch(
        guild,
        member,
        interaction.options.getString('query', true)
      );
      if (search.results.length === 0) {
        await interaction.editReply({
          embeds: [
            ui.warning('No music results', 'Try a different search, or provide a direct audio URL.')
          ]
        });
        return;
      }
      await interaction.editReply({
        ...ui.musicSearch(search.id, interaction.options.getString('query', true), search.results),
        allowedMentions: { parse: [] }
      });
      return;
    }
    if (subcommand === 'queue') {
      const queue = music.getQueue(guild.id);
      await interaction.reply({
        embeds: [
          ui.page('info', {
            title: ui.labeled('BLE Music queue', 'queue'),
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
    if (subcommand === 'now-playing') {
      const view = music.getView(guild.id);
      await interaction.reply({
        ...ui.musicController(view),
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
      return;
    }
    if (subcommand === 'controller') {
      const existing = music.getControllerLocation(guild.id);
      if (existing) {
        await interaction.reply({
          embeds: [
            ui.info(
              'BLE Music controller',
              `[Open the existing controller](https://discord.com/channels/${guild.id}/${existing.channelId}/${existing.messageId}).`
            )
          ],
          ephemeral: true
        });
        return;
      }
      const view = music.getView(guild.id);
      await interaction.reply({ ...ui.musicController(view), allowedMentions: { parse: [] } });
      const message = await interaction.fetchReply();
      await music.setController(guild.id, { channelId: message.channelId, messageId: message.id });
      return;
    }
    if (subcommand === 'settings') {
      const status = await premium.status(guild.id);
      await interaction.reply({
        embeds: [
          ui.page('info', {
            title: ui.labeled('BLE Music settings', 'settings'),
            description:
              'BLE Music is not a 24/7 player. It cleans up abandoned sessions automatically.',
            fields: [
              { name: 'Plan', value: status.plan, inline: true },
              {
                name: 'Queue capacity',
                value: `${status.limits.musicQueueLength} tracks`,
                inline: true
              },
              {
                name: 'Empty voice channel',
                value: `${status.limits.musicEmptyChannelTimeoutMinutes} minutes`,
                inline: true
              },
              {
                name: 'Idle queue',
                value: `${status.limits.musicIdleTimeoutMinutes} minutes`,
                inline: true
              }
            ]
          })
        ],
        ephemeral: true
      });
      return;
    }

    const view =
      subcommand === 'pause'
        ? await music.pause(guild.id, member)
        : subcommand === 'resume'
          ? await music.resume(guild.id, member)
          : subcommand === 'stop'
            ? await music.stop(guild.id, member)
            : subcommand === 'skip'
              ? await music.skip(guild.id, member)
              : subcommand === 'previous'
                ? await music.previous(guild.id, member)
                : subcommand === 'seek'
                  ? await music.seek(
                      guild.id,
                      member,
                      interaction.options.getInteger('seconds', true)
                    )
                  : subcommand === 'volume'
                    ? await music.setVolume(
                        guild.id,
                        member,
                        interaction.options.getInteger('amount', true)
                      )
                    : subcommand === 'loop'
                      ? await music.setLoop(
                          guild.id,
                          member,
                          loopMode(interaction.options.getString('mode', true))
                        )
                      : subcommand === 'shuffle'
                        ? await music.shuffle(guild.id, member)
                        : subcommand === 'remove'
                          ? await music.remove(
                              guild.id,
                              member,
                              interaction.options.getInteger('position', true)
                            )
                          : subcommand === 'move'
                            ? await music.move(
                                guild.id,
                                member,
                                interaction.options.getInteger('from', true),
                                interaction.options.getInteger('to', true)
                              )
                            : subcommand === 'clear'
                              ? await music.clear(guild.id, member)
                              : await music.disconnect(guild.id, member);
    if (!view) throw new ResourceNotFoundError('There is no BLE Music session to disconnect.');
    await interaction.reply({
      embeds: [ui.info('BLE Music updated', view.note ?? 'Player state updated.')],
      ephemeral: true
    });
  }
});
