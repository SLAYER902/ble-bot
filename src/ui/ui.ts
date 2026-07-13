import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

import type { EmojiKey, EmojiRegistry } from './emoji/emoji-registry.js';
import type { MusicControllerView, MusicSearchResult } from '../features/music/types.js';

const colors = {
  success: 0x57f287,
  error: 0xed4245,
  warning: 0xfee75c,
  info: 0x5865f2,
  security: 0x9b59b6
} as const;

export type UiKind = keyof typeof colors;
export type ResourceLink = Readonly<{ label: string; url: string; emoji?: EmojiKey }>;
export type BleField = Readonly<{ name: string; value: string; inline?: boolean }>;
export type TicketPanelView = Readonly<{
  id: string;
  name: string;
  description: string;
  maxOpenPerUser: number;
  enabled: boolean;
}>;
export type TicketControlView = Readonly<{
  id: string;
  openerId: string;
  category: string;
  subject: string;
  details: string;
  status: string;
  priority: string;
  claimedBy?: string;
  createdAt: Date;
}>;
export type TicketEditorView = Readonly<{
  id: string;
  name: string;
  targetChannelId?: string;
  categoryId?: string;
  staffRoleIds: readonly string[];
}>;
export type NavigationOption = Readonly<{ label: string; value: string; description: string }>;

const formatMusicDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const musicProgress = (positionMs: number, durationMs: number): string => {
  const width = 18;
  const completed = durationMs > 0 ? Math.round((positionMs / durationMs) * width) : 0;
  return `[${'#'.repeat(Math.min(width, Math.max(0, completed)))}${'-'.repeat(
    Math.max(0, width - completed)
  )}]`;
};

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

  public page(
    kind: UiKind,
    input: Readonly<{
      title: string;
      description: string;
      fields?: readonly BleField[];
      footer?: string;
    }>
  ): EmbedBuilder {
    const embed = this.embed(kind, input.title, input.description);
    if (input.fields?.length) embed.addFields(input.fields.map((field) => ({ ...field })));
    if (input.footer) embed.setFooter({ text: input.footer });
    return embed;
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

  public loading(title: string, description: string): EmbedBuilder {
    return this.embed('info', this.labeled(title, 'loading'), description);
  }

  public emptyState(title: string, description: string): EmbedBuilder {
    return this.embed('info', title, description);
  }

  public permissionError(description: string): EmbedBuilder {
    return this.embed('error', this.labeled('Permission required', 'lock'), description);
  }

  public premiumNotice(
    input: Readonly<{ title: string; currentUsage: string; freeAlternative: string }>
  ): EmbedBuilder {
    return this.page('warning', {
      title: this.labeled(input.title, 'premium'),
      description: input.currentUsage,
      fields: [{ name: 'Available now', value: input.freeAlternative }],
      footer: 'BLE Premium expands limits. Core protections stay available on the Free plan.'
    });
  }

  public setupProgress(
    input: Readonly<{ step: number; completed: boolean; currentSection: string }>
  ): EmbedBuilder {
    return this.page('info', {
      title: this.labeled('BLE Setup Centre', 'guide'),
      description: input.completed
        ? 'Setup is complete. You can reopen any module when your server changes.'
        : 'Your workspace is saved. Continue when you are ready.',
      fields: [
        { name: 'Progress', value: `${input.step} of 17`, inline: true },
        { name: 'Current section', value: input.currentSection, inline: true },
        {
          name: this.labeled('Workspace state', 'verified'),
          value: input.completed ? 'Complete' : 'In progress',
          inline: true
        }
      ],
      footer:
        'BLE Setup Centre updates the same workspace instead of creating duplicate setup messages.'
    });
  }

  public setupControlPanel(
    input: Readonly<{ step: number; completed: boolean; currentSection: string }>
  ) {
    return {
      embeds: [this.setupProgress(input)],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.actionButton(
            'ble:setup:continue',
            'Continue setup',
            ButtonStyle.Primary,
            'guide',
            input.completed
          ),
          this.actionButton(
            'ble:setup:diagnostics',
            'Run diagnostics',
            ButtonStyle.Secondary,
            'settings'
          ),
          this.actionButton(
            'ble:setup:progress',
            'View progress',
            ButtonStyle.Secondary,
            'information'
          ),
          this.actionButton('ble:setup:exit', 'Exit', ButtonStyle.Secondary, 'cancel')
        ),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ble:setup:module')
            .setPlaceholder('Browse a setup module')
            .addOptions(
              {
                label: 'Security',
                value: 'security',
                description: 'Review BLE Shield protection.'
              },
              {
                label: 'Backups',
                value: 'backups',
                description: 'Create a safe recovery baseline.'
              },
              {
                label: 'Moderation',
                value: 'moderation',
                description: 'Review staff action readiness.'
              },
              {
                label: 'Tickets',
                value: 'tickets',
                description: 'Configure ticket intake panels.'
              },
              {
                label: 'Music',
                value: 'music',
                description: 'Music is available when a compliant source service is configured.'
              },
              {
                label: 'Voice',
                value: 'voice',
                description: 'Temporary voice setup is available when the module is enabled.'
              },
              {
                label: 'AI',
                value: 'ai',
                description: 'Review optional AI provider configuration.'
              }
            )
            .setMinValues(1)
            .setMaxValues(1)
        )
      ]
    };
  }

  public ticketPanel(panel: TicketPanelView): Readonly<{
    embeds: readonly EmbedBuilder[];
    components: readonly ActionRowBuilder<ButtonBuilder>[];
  }> {
    const status = panel.enabled ? 'Open for requests' : 'Temporarily unavailable';
    return {
      embeds: [
        this.page('info', {
          title: this.labeled(panel.name, 'ticket'),
          description: panel.description,
          fields: [
            { name: this.labeled('Status', 'verified'), value: status, inline: true },
            {
              name: this.labeled('Open ticket limit', 'member'),
              value: `${panel.maxOpenPerUser} per member`,
              inline: true
            },
            {
              name: this.labeled('Next action', 'star'),
              value: panel.enabled ? 'Select Open ticket to begin.' : 'Please check back later.'
            }
          ],
          footer: 'BLE Tickets keeps requests private and records their lifecycle.'
        })
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.actionButton(
            `ble:ticket:open:${panel.id}`,
            'Open ticket',
            ButtonStyle.Primary,
            'ticket',
            !panel.enabled
          )
        )
      ]
    };
  }

  public ticketControlPanel(ticket: TicketControlView): Readonly<{
    embeds: readonly EmbedBuilder[];
    components: readonly ActionRowBuilder<ButtonBuilder>[];
  }> {
    const closed = ticket.status === 'CLOSED';
    const status = closed ? 'Closed' : 'Open';
    const assigned = ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed';
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    if (closed) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.actionButton(
            `ble:ticket:reopen:${ticket.id}`,
            'Reopen',
            ButtonStyle.Primary,
            'unlock'
          ),
          this.actionButton(
            `ble:ticket:transcript:${ticket.id}`,
            'Transcript',
            ButtonStyle.Secondary,
            'documentation'
          ),
          this.actionButton(`ble:ticket:delete:${ticket.id}`, 'Delete', ButtonStyle.Danger, 'close')
        )
      );
    } else {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.actionButton(
            `ble:ticket:${ticket.claimedBy ? 'unclaim' : 'claim'}:${ticket.id}`,
            ticket.claimedBy ? 'Unclaim' : 'Claim',
            ButtonStyle.Primary,
            'claim'
          ),
          this.actionButton(`ble:ticket:close:${ticket.id}`, 'Close', ButtonStyle.Danger, 'close'),
          this.actionButton(
            `ble:ticket:info:${ticket.id}`,
            'Info',
            ButtonStyle.Secondary,
            'information'
          ),
          this.actionButton(
            `ble:ticket:transcript:${ticket.id}`,
            'Transcript',
            ButtonStyle.Secondary,
            'documentation'
          )
        )
      );
    }
    return {
      embeds: [
        this.page('info', {
          title: this.labeled('BLE Support Ticket', 'ticket'),
          description: `Ticket ID: ${ticket.id}`,
          fields: [
            {
              name: this.labeled('Created by', 'member'),
              value: `<@${ticket.openerId}>`,
              inline: true
            },
            { name: 'Category', value: ticket.category, inline: true },
            { name: this.labeled('Status', 'verified'), value: status, inline: true },
            { name: this.labeled('Priority', 'crown'), value: ticket.priority, inline: true },
            { name: 'Assigned staff', value: assigned, inline: true },
            {
              name: 'Created',
              value: `<t:${Math.floor(ticket.createdAt.getTime() / 1_000)}:R>`,
              inline: true
            },
            { name: 'Subject', value: ticket.subject },
            { name: 'Request details', value: ticket.details }
          ],
          footer:
            'BLE Ticket controls validate staff permissions and ticket state for every action.'
        })
      ],
      components: rows
    };
  }

  public ticketPanelEditor(panel: TicketEditorView): Readonly<{
    embeds: readonly EmbedBuilder[];
    components: readonly ActionRowBuilder<
      ChannelSelectMenuBuilder | RoleSelectMenuBuilder | ButtonBuilder
    >[];
  }> {
    const target = panel.targetChannelId ? `<#${panel.targetChannelId}>` : 'Not selected';
    const category = panel.categoryId ? `<#${panel.categoryId}>` : 'Not selected';
    const staff = panel.staffRoleIds.length
      ? panel.staffRoleIds.map((id) => `<@&${id}>`).join(', ')
      : 'Manage Channels only';
    return {
      embeds: [
        this.page('info', {
          title: this.labeled(`Ticket panel: ${panel.name}`, 'settings'),
          description:
            'Select where to publish this panel, where new ticket channels belong, and which roles may claim tickets.',
          fields: [
            { name: 'Panel channel', value: target, inline: true },
            { name: 'Ticket category', value: category, inline: true },
            { name: 'Staff roles', value: staff }
          ],
          footer: 'Selections save immediately and remain active after bot restarts.'
        })
      ],
      components: [
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`ble:ticket:panel-target:${panel.id}`)
            .setPlaceholder('Select the channel for the public ticket panel')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1)
            .setMaxValues(1)
        ),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`ble:ticket:panel-category:${panel.id}`)
            .setPlaceholder('Select the category for new ticket channels')
            .setChannelTypes(ChannelType.GuildCategory)
            .setMinValues(1)
            .setMaxValues(1)
        ),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`ble:ticket:panel-staff:${panel.id}`)
            .setPlaceholder('Select staff roles that can manage tickets')
            .setMinValues(0)
            .setMaxValues(10)
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.actionButton(
            `ble:ticket:panel-publish:${panel.id}`,
            'Publish panel',
            ButtonStyle.Primary,
            'ticket'
          )
        )
      ]
    };
  }

  public ticketSetupCentre(
    input: Readonly<{ panelCount: number; panelLimit: number; plan: string }>
  ): Readonly<{
    embeds: readonly EmbedBuilder[];
    components: readonly ActionRowBuilder<ButtonBuilder>[];
  }> {
    return {
      embeds: [
        this.page('info', {
          title: this.labeled('BLE Ticket Setup', 'ticket'),
          description:
            'Create a persistent ticket panel, configure it with channel and role selectors, then publish it for members.',
          fields: [
            { name: 'Plan', value: input.plan, inline: true },
            {
              name: this.labeled('Ticket panels', 'ticket'),
              value: `${input.panelCount} of ${input.panelLimit}`,
              inline: true
            },
            {
              name: this.labeled('Next action', 'star'),
              value: 'Create a panel, then use the editor to select channels and staff roles.'
            }
          ],
          footer:
            'BLE Tickets validates every button action against the current guild and stored panel.'
        })
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.actionButton(
            'ble:ticket:setup-create:root',
            'Create panel',
            ButtonStyle.Primary,
            'ticket'
          )
        )
      ]
    };
  }

  public musicSearch(
    sessionId: string,
    query: string,
    results: readonly MusicSearchResult[]
  ): Readonly<{
    embeds: readonly EmbedBuilder[];
    components: readonly ActionRowBuilder<StringSelectMenuBuilder>[];
  }> {
    return {
      embeds: [
        this.page('info', {
          title: this.labeled('BLE Music search', 'music'),
          description: `Choose a result for: ${query}`,
          fields: results.map((result, index) => ({
            name: `${index + 1}. ${result.title.slice(0, 90)}`,
            value: `${result.author.slice(0, 80)} | ${formatMusicDuration(result.durationMs)}`
          })),
          footer:
            'Only the person who started this search can choose a track. Selection expires in 5 minutes.'
        })
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`ble:music:search:${sessionId}`)
            .setPlaceholder('Select a track to add to BLE Music')
            .addOptions(
              results.map((result, index) => ({
                label: `${index + 1}. ${result.title}`.slice(0, 100),
                value: String(index),
                description: `${result.author} | ${formatMusicDuration(result.durationMs)}`.slice(
                  0,
                  100
                )
              }))
            )
            .setMinValues(1)
            .setMaxValues(1)
        )
      ]
    };
  }

  public musicController(view: MusicControllerView): Readonly<{
    embeds: readonly EmbedBuilder[];
    components: readonly ActionRowBuilder<ButtonBuilder>[];
  }> {
    const disconnected = view.state === 'DISCONNECTED';
    const current = view.current;
    const duration = current ? formatMusicDuration(current.durationMs) : '0:00';
    const position = current ? formatMusicDuration(view.positionMs) : '0:00';
    const controllerId = `ble:music`;
    return {
      embeds: [
        this.page('info', {
          title: this.labeled('BLE Music', 'music'),
          description: current
            ? `Now playing: ${current.title}\n${current.author}`
            : disconnected
              ? 'No active voice connection. Start a new search from a voice channel.'
              : 'No track is playing. BLE Music will clean up an inactive session automatically.',
          fields: [
            {
              name: this.labeled('Progress', 'music'),
              value: `${musicProgress(view.positionMs, current?.durationMs ?? 0)} ${position} / ${duration}`
            },
            {
              name: 'Voice channel',
              value: view.voiceChannelId ? `<#${view.voiceChannelId}>` : 'Not connected',
              inline: true
            },
            { name: 'State', value: view.state, inline: true },
            { name: 'Queue', value: `${view.queueLength} upcoming`, inline: true },
            { name: 'Volume', value: `${view.volume}%`, inline: true },
            { name: 'Loop', value: view.loop, inline: true },
            ...(current
              ? [
                  {
                    name: this.labeled('Requested by', 'member'),
                    value: `<@${current.requestedBy}>`
                  }
                ]
              : [])
          ],
          footer:
            view.note ??
            'BLE Music disconnects automatically when a channel is empty or its queue stays idle.'
        })
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.actionButton(
            `${controllerId}:previous:${view.guildId}`,
            'Previous',
            ButtonStyle.Secondary,
            'previous',
            !view.previousAvailable || disconnected
          ),
          this.actionButton(
            `${controllerId}:${view.state === 'PAUSED' ? 'resume' : 'pause'}:${view.guildId}`,
            view.state === 'PAUSED' ? 'Resume' : 'Pause',
            ButtonStyle.Primary,
            view.state === 'PAUSED' ? 'resume' : 'pause',
            !current || disconnected
          ),
          this.actionButton(
            `${controllerId}:skip:${view.guildId}`,
            'Skip',
            ButtonStyle.Secondary,
            'skip',
            !view.skipAvailable || disconnected
          ),
          this.actionButton(
            `${controllerId}:stop:${view.guildId}`,
            'Stop',
            ButtonStyle.Danger,
            'stop',
            disconnected
          ),
          this.actionButton(
            `${controllerId}:queue:${view.guildId}`,
            'Queue',
            ButtonStyle.Secondary,
            'queue',
            disconnected
          )
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.actionButton(
            `${controllerId}:loop:${view.guildId}`,
            `Loop: ${view.loop}`,
            ButtonStyle.Secondary,
            'loop',
            disconnected
          ),
          this.actionButton(
            `${controllerId}:shuffle:${view.guildId}`,
            'Shuffle',
            ButtonStyle.Secondary,
            'shuffle',
            view.queueLength < 2 || disconnected
          ),
          this.actionButton(
            `${controllerId}:volume:${view.guildId}`,
            'Volume',
            ButtonStyle.Secondary,
            'volume',
            disconnected
          ),
          this.actionButton(
            `${controllerId}:disconnect:${view.guildId}`,
            'Disconnect',
            ButtonStyle.Danger,
            'voice',
            disconnected
          )
        )
      ]
    };
  }

  public musicVolumeModal(guildId: string): ModalBuilder {
    return new ModalBuilder()
      .setCustomId(`ble:music:volume-submit:${guildId}`)
      .setTitle('Set BLE Music volume')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('volume')
            .setLabel('Volume from 0 to 200')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(3)
            .setPlaceholder('Example: 100')
        )
      );
  }

  public navigation(
    input: Readonly<{
      selectId: string;
      placeholder: string;
      options: readonly NavigationOption[];
      previousId: string;
      nextId: string;
      homeId: string;
      setupId: string;
      searchId: string;
    }>
  ) {
    return [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(input.selectId)
          .setPlaceholder(input.placeholder)
          .addOptions(input.options.slice(0, 25))
          .setMinValues(1)
          .setMaxValues(1)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        this.actionButton(input.previousId, 'Previous', ButtonStyle.Secondary, 'previousPage'),
        this.actionButton(input.nextId, 'Next', ButtonStyle.Secondary, 'next'),
        this.actionButton(input.homeId, 'Home', ButtonStyle.Secondary, 'information'),
        this.actionButton(input.setupId, 'Setup', ButtonStyle.Primary, 'guide'),
        this.actionButton(input.searchId, 'Search', ButtonStyle.Secondary, 'search')
      )
    ];
  }

  public ticketPanelCreateModal(): ModalBuilder {
    return new ModalBuilder()
      .setCustomId('ble:ticket:panel-create:root')
      .setTitle('Create BLE ticket panel')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Panel name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(80)
            .setPlaceholder('Example: BLE Support')
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Short member-facing description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(500)
            .setPlaceholder('Explain what this support panel is for')
        )
      );
  }

  public searchModal(
    input: Readonly<{ customId: string; title: string; label: string; placeholder: string }>
  ): ModalBuilder {
    return new ModalBuilder()
      .setCustomId(input.customId)
      .setTitle(input.title)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('query')
            .setLabel(input.label)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(48)
            .setPlaceholder(input.placeholder)
        )
      );
  }

  public ticketIntakeModal(panel: Pick<TicketPanelView, 'id' | 'name'>): ModalBuilder {
    return new ModalBuilder()
      .setCustomId(`ble:ticket:submit:${panel.id}`)
      .setTitle(`Open: ${panel.name}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('subject')
            .setLabel('Subject')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(120)
            .setPlaceholder('Briefly describe the request')
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('details')
            .setLabel('Details')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1_000)
            .setPlaceholder('Include the information staff need to help')
        )
      );
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
    const confirmEmoji = this.emojis.button('confirm');
    const cancelEmoji = this.emojis.button('cancel');
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
        const emoji = link.emoji ? this.emojis.button(link.emoji) : undefined;
        if (emoji) button.setEmoji(emoji);
        return button;
      })
    );
  }

  public labeled(title: string, emoji: EmojiKey | undefined): string {
    const rendered = emoji ? this.emojis.format(emoji) : undefined;
    return rendered ? `${rendered} ${title}` : title;
  }

  private actionButton(
    customId: string,
    label: string,
    style: ButtonStyle,
    emoji?: EmojiKey,
    disabled = false
  ): ButtonBuilder {
    const button = new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(disabled);
    const configuredEmoji = emoji ? this.emojis.button(emoji) : undefined;
    if (configuredEmoji) button.setEmoji(configuredEmoji);
    return button;
  }
}
