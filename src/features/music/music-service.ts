import { PermissionFlagsBits, type Client, type Guild, type GuildMember } from 'discord.js';
import WebSocket from 'ws';

import type { AppConfig } from '../../config/env.js';
import {
  MusicServiceError,
  PermissionDeniedError,
  ResourceNotFoundError,
  ValidationError
} from '../../errors/domain-error.js';
import type { PremiumStatus } from '../premium/premium-service.js';
import type { Ui } from '../../ui/ui.js';
import type { Logger } from 'pino';
import type { MusicControllerView, MusicLoopMode, MusicSearchResult, MusicTrack } from './types.js';

type LavalinkTrack = Readonly<{
  encoded: string;
  info: Readonly<{
    title: string;
    author: string;
    length: number;
    uri?: string | null;
    artworkUrl?: string | null;
    isSeekable: boolean;
  }>;
}>;

type LavalinkLoadResult = Readonly<{
  loadType: string;
  data?:
    | LavalinkTrack
    | readonly LavalinkTrack[]
    | Readonly<{ tracks: readonly LavalinkTrack[] }>
    | null;
}>;

type VoiceDetails = Readonly<{
  token: string;
  endpoint: string;
  sessionId: string;
  channelId: string;
}>;

type ControllerLocation = Readonly<{ channelId: string; messageId: string }>;
type GuildAdapter = ReturnType<Guild['voiceAdapterCreator']>;

type MusicSession = {
  guild: Guild;
  guildId: string;
  voiceChannelId: string | undefined;
  adapter: GuildAdapter | undefined;
  current: MusicTrack | undefined;
  queue: MusicTrack[];
  history: MusicTrack[];
  volume: number;
  loop: MusicLoopMode;
  paused: boolean;
  positionMs: number;
  state: 'PLAYING' | 'PAUSED' | 'IDLE' | 'DISCONNECTED';
  controller: ControllerLocation | undefined;
  note: string | undefined;
  emptyTimer: NodeJS.Timeout | undefined;
  idleTimer: NodeJS.Timeout | undefined;
  emptyTimeoutMs: number;
  idleTimeoutMs: number;
};

type MusicSearchSession = Readonly<{
  guildId: string;
  requesterId: string;
  results: readonly MusicSearchResult[];
  expiresAt: number;
}>;

const isUrl = (input: string): boolean => /^https?:\/\//iu.test(input.trim());

const toTrack = (track: LavalinkTrack): MusicSearchResult => ({
  encoded: track.encoded,
  title: track.info.title,
  author: track.info.author,
  durationMs: track.info.length,
  ...(track.info.uri ? { uri: track.info.uri } : {}),
  ...(track.info.artworkUrl ? { artworkUrl: track.info.artworkUrl } : {}),
  isSeekable: track.info.isSeekable
});

const noOp = (): void => undefined;

const rawDataToText = (value: WebSocket.RawData): string => {
  if (Array.isArray(value)) return Buffer.concat(value).toString('utf8');
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8');
  return value.toString('utf8');
};

export class MusicService {
  private readonly sessions = new Map<string, MusicSession>();
  private readonly searches = new Map<string, MusicSearchSession>();
  private websocket: WebSocket | undefined;
  private lavalinkSessionId: string | undefined;
  private connecting: Promise<void> | undefined;

  public constructor(
    private readonly client: Client,
    private readonly config: AppConfig,
    private readonly ui: Ui,
    private readonly logger: Logger
  ) {}

  public async initialize(): Promise<void> {
    if (!this.client.user) return;
    await this.ensureNode();
  }

  public async close(): Promise<void> {
    await Promise.allSettled([...this.sessions.keys()].map((guildId) => this.disconnect(guildId)));
    this.websocket?.close();
    this.websocket = undefined;
    this.lavalinkSessionId = undefined;
  }

  public async search(query: string): Promise<readonly MusicSearchResult[]> {
    const text = query.trim();
    if (text.length < 2 || text.length > 256)
      throw new ValidationError('Music searches must be between 2 and 256 characters.');
    const identifier = isUrl(text) ? text : `ytsearch:${text}`;
    const result = await this.rest<LavalinkLoadResult>(
      `/loadtracks?identifier=${encodeURIComponent(identifier)}`
    );
    const tracks = Array.isArray(result.data)
      ? result.data
      : result.data && 'tracks' in result.data
        ? result.data.tracks
        : result.data
          ? [result.data]
          : [];
    return tracks.slice(0, 5).map(toTrack);
  }

  public async prepareSearch(
    guild: Guild,
    member: GuildMember,
    query: string
  ): Promise<Readonly<{ id: string; results: readonly MusicSearchResult[] }>> {
    if (!member.voice.channel?.isVoiceBased())
      throw new ValidationError('Join a voice channel before searching for music.');
    const results = await this.search(query);
    const id = crypto.randomUUID();
    this.searches.set(id, {
      guildId: guild.id,
      requesterId: member.id,
      results,
      expiresAt: Date.now() + 5 * 60 * 1_000
    });
    setTimeout(() => this.searches.delete(id), 5 * 60 * 1_000).unref();
    return { id, results };
  }

  public async selectSearch(
    id: string,
    guild: Guild,
    member: GuildMember,
    resultIndex: number,
    premium: PremiumStatus
  ): Promise<MusicControllerView> {
    const search = this.searches.get(id);
    this.searches.delete(id);
    if (!search || search.expiresAt <= Date.now())
      throw new ValidationError('This music search expired. Run /music play again.');
    if (search.guildId !== guild.id || search.requesterId !== member.id)
      throw new PermissionDeniedError(
        'Only the person who started this search can choose a track.'
      );
    const track = search.results[resultIndex];
    if (!track) throw new ValidationError('That music search result no longer exists.');
    return this.play(guild, member, track, premium);
  }

  public async play(
    guild: Guild,
    member: GuildMember,
    track: MusicSearchResult,
    premium: PremiumStatus
  ): Promise<MusicControllerView> {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel || !voiceChannel.isVoiceBased())
      throw new ValidationError('Join a voice channel before selecting a track.');
    let session = this.sessions.get(guild.id);
    if (!session) {
      session = this.createSession(guild);
      this.sessions.set(guild.id, session);
    }
    if (
      session.voiceChannelId &&
      session.voiceChannelId !== voiceChannel.id &&
      session.state !== 'DISCONNECTED'
    )
      throw new PermissionDeniedError('BLE Music is already active in another voice channel.');
    const requested: MusicTrack = { ...track, requestedBy: member.id };
    session.emptyTimeoutMs = premium.limits.musicEmptyChannelTimeoutMinutes * 60 * 1_000;
    session.idleTimeoutMs = premium.limits.musicIdleTimeoutMinutes * 60 * 1_000;
    if (session.current) {
      if (session.queue.length >= premium.limits.musicQueueLength)
        throw new ValidationError(
          `This server has reached its ${premium.limits.musicQueueLength}-track music queue limit.`
        );
      session.queue.push(requested);
      session.note = `${requested.title} was added to the queue.`;
      await this.refreshController(session);
      return this.view(session);
    }
    await this.startSession(session, voiceChannel.id, requested);
    return this.view(session);
  }

  public async pause(guildId: string, member: GuildMember): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    if (!session.current || session.paused)
      throw new ValidationError('Music is not currently playing.');
    await this.updatePlayer(session, { paused: true });
    session.paused = true;
    session.state = 'PAUSED';
    session.note = 'Playback paused.';
    await this.refreshController(session);
    return this.view(session);
  }

  public async resume(guildId: string, member: GuildMember): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    if (!session.current || !session.paused) throw new ValidationError('Music is not paused.');
    await this.updatePlayer(session, { paused: false });
    session.paused = false;
    session.state = 'PLAYING';
    session.note = 'Playback resumed.';
    await this.refreshController(session);
    return this.view(session);
  }

  public async skip(guildId: string, member: GuildMember): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    if (!session.current) throw new ValidationError('There is no track to skip.');
    await this.advance(session, 'Track skipped.');
    return this.view(session);
  }

  public async previous(guildId: string, member: GuildMember): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    const previous = session.history.pop();
    if (!previous) throw new ValidationError('There is no previous track in this session.');
    if (session.current) session.queue.unshift(session.current);
    session.current = previous;
    await this.updatePlayer(session, { track: { encoded: previous.encoded } });
    session.positionMs = 0;
    session.paused = false;
    session.state = 'PLAYING';
    session.note = 'Returned to the previous track.';
    await this.refreshController(session);
    return this.view(session);
  }

  public async stop(guildId: string, member: GuildMember): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    await this.disconnectSession(session, 'Playback stopped and the player disconnected.');
    return this.view(session);
  }

  public async disconnect(
    guildId: string,
    member?: GuildMember
  ): Promise<MusicControllerView | undefined> {
    const session = this.sessions.get(guildId);
    if (!session) return undefined;
    if (member) this.requireControl(guildId, member);
    await this.disconnectSession(session, 'Disconnected from the voice channel.');
    return this.view(session);
  }

  public async setVolume(
    guildId: string,
    member: GuildMember,
    volume: number
  ): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    if (!Number.isInteger(volume) || volume < 0 || volume > 200)
      throw new ValidationError('Volume must be a whole number from 0 to 200.');
    await this.updatePlayer(session, { volume });
    session.volume = volume;
    session.note = `Volume set to ${volume}%.`;
    await this.refreshController(session);
    return this.view(session);
  }

  public async seek(
    guildId: string,
    member: GuildMember,
    positionSeconds: number
  ): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    if (!session.current?.isSeekable)
      throw new ValidationError('The current track cannot be seeked.');
    const positionMs = positionSeconds * 1_000;
    if (
      !Number.isInteger(positionSeconds) ||
      positionMs < 0 ||
      positionMs >= session.current.durationMs
    )
      throw new ValidationError('Seek position must be inside the current track.');
    await this.updatePlayer(session, { position: positionMs });
    session.positionMs = positionMs;
    session.note = `Playback moved to ${positionSeconds} seconds.`;
    await this.refreshController(session);
    return this.view(session);
  }

  public async setLoop(
    guildId: string,
    member: GuildMember,
    loop: MusicLoopMode
  ): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    session.loop = loop;
    session.note = `Loop mode set to ${loop.toLowerCase()}.`;
    await this.refreshController(session);
    return this.view(session);
  }

  public async shuffle(guildId: string, member: GuildMember): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    if (session.queue.length < 2)
      throw new ValidationError('At least two queued tracks are required to shuffle.');
    for (let index = session.queue.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      const current = session.queue[index];
      session.queue[index] = session.queue[swap] as MusicTrack;
      session.queue[swap] = current as MusicTrack;
    }
    session.note = 'Queued tracks shuffled.';
    await this.refreshController(session);
    return this.view(session);
  }

  public async remove(
    guildId: string,
    member: GuildMember,
    position: number
  ): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    if (!Number.isInteger(position) || position < 1 || position > session.queue.length)
      throw new ValidationError('Choose a queue position that exists.');
    const [removed] = session.queue.splice(position - 1, 1);
    session.note = `${removed?.title ?? 'Track'} removed from the queue.`;
    await this.refreshController(session);
    return this.view(session);
  }

  public async move(
    guildId: string,
    member: GuildMember,
    from: number,
    to: number
  ): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      to < 1 ||
      from > session.queue.length ||
      to > session.queue.length
    )
      throw new ValidationError('Both queue positions must exist.');
    const [track] = session.queue.splice(from - 1, 1);
    session.queue.splice(to - 1, 0, track as MusicTrack);
    session.note = 'Queue order updated.';
    await this.refreshController(session);
    return this.view(session);
  }

  public async clear(guildId: string, member: GuildMember): Promise<MusicControllerView> {
    const session = this.requireControl(guildId, member);
    session.queue = [];
    session.note = 'Upcoming tracks cleared.';
    await this.refreshController(session);
    return this.view(session);
  }

  public getView(guildId: string): MusicControllerView {
    return this.view(this.requireSession(guildId));
  }

  public getQueue(guildId: string): readonly MusicTrack[] {
    return [...this.requireSession(guildId).queue];
  }

  public hasController(guildId: string): boolean {
    return Boolean(this.sessions.get(guildId)?.controller);
  }

  public getControllerLocation(guildId: string): ControllerLocation | undefined {
    return this.sessions.get(guildId)?.controller;
  }

  public async setController(
    guildId: string,
    controller: ControllerLocation
  ): Promise<MusicControllerView> {
    const session = this.requireSession(guildId);
    session.controller = controller;
    await this.refreshController(session);
    return this.view(session);
  }

  public observeVoiceState(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (!session?.voiceChannelId || session.state === 'DISCONNECTED') return;
    const channel = session.guild.channels.cache.get(session.voiceChannelId);
    if (!channel?.isVoiceBased()) return;
    const humans = [...channel.members.values()].filter((member) => !member.user.bot).length;
    if (humans === 0) this.scheduleEmptyDisconnect(session);
    else this.cancelEmptyDisconnect(session);
  }

  private createSession(guild: Guild): MusicSession {
    return {
      guild,
      guildId: guild.id,
      voiceChannelId: undefined,
      adapter: undefined,
      current: undefined,
      queue: [],
      history: [],
      volume: 100,
      loop: 'OFF',
      paused: false,
      positionMs: 0,
      state: 'DISCONNECTED',
      controller: undefined,
      note: undefined,
      emptyTimer: undefined,
      idleTimer: undefined,
      emptyTimeoutMs: 3 * 60 * 1_000,
      idleTimeoutMs: 5 * 60 * 1_000
    };
  }

  private requireSession(guildId: string): MusicSession {
    const session = this.sessions.get(guildId);
    if (!session)
      throw new ResourceNotFoundError('There is no active BLE Music session in this server.');
    return session;
  }

  private requireControl(guildId: string, member: GuildMember): MusicSession {
    const session = this.requireSession(guildId);
    if (session.state === 'DISCONNECTED' || !session.voiceChannelId)
      throw new ValidationError('BLE Music is not connected to a voice channel.');
    if (
      member.voice.channelId !== session.voiceChannelId &&
      !member.permissions.has(PermissionFlagsBits.ManageGuild)
    )
      throw new PermissionDeniedError(
        'Join BLE Music’s voice channel before using its controls, or use Manage Server.'
      );
    return session;
  }

  private async startSession(
    session: MusicSession,
    voiceChannelId: string,
    track: MusicTrack
  ): Promise<void> {
    await this.ensureNode();
    const voice = await this.requestVoice(session.guild, voiceChannelId);
    session.voiceChannelId = voiceChannelId;
    session.current = track;
    session.positionMs = 0;
    session.paused = false;
    session.state = 'PLAYING';
    session.note = `Now playing ${track.title}.`;
    this.cancelIdleDisconnect(session);
    try {
      await this.updatePlayer(session, {
        voice,
        volume: session.volume,
        paused: false,
        track: { encoded: track.encoded, userData: { requestedBy: track.requestedBy } }
      });
    } catch (error) {
      await this.disconnectSession(session, 'BLE Music could not start playback.');
      throw error;
    }
    this.observeVoiceState(session.guildId);
    await this.refreshController(session);
  }

  private async advance(session: MusicSession, note: string): Promise<void> {
    const completed = session.current;
    if (!completed) return;
    if (session.loop === 'TRACK') {
      await this.updatePlayer(session, { track: { encoded: completed.encoded } });
      session.positionMs = 0;
      session.paused = false;
      session.state = 'PLAYING';
      session.note = 'Repeating the current track.';
      await this.refreshController(session);
      return;
    }
    if (session.loop === 'QUEUE') session.queue.push(completed);
    session.history.push(completed);
    const next = session.queue.shift();
    if (!next) {
      await this.updatePlayer(session, { track: { encoded: null } });
      session.current = undefined;
      session.positionMs = 0;
      session.paused = false;
      session.state = 'IDLE';
      session.note = `Queue finished. BLE Music will disconnect after ${Math.round(
        session.idleTimeoutMs / 60_000
      )} minutes of inactivity.`;
      this.scheduleIdleDisconnect(session);
      await this.refreshController(session);
      return;
    }
    session.current = next;
    session.positionMs = 0;
    session.paused = false;
    session.state = 'PLAYING';
    session.note = note;
    await this.updatePlayer(session, { track: { encoded: next.encoded }, paused: false });
    await this.refreshController(session);
  }

  private async disconnectSession(session: MusicSession, note: string): Promise<void> {
    this.cancelEmptyDisconnect(session);
    this.cancelIdleDisconnect(session);
    if (this.lavalinkSessionId && session.voiceChannelId) {
      await this.rest<void>(`/sessions/${this.lavalinkSessionId}/players/${session.guildId}`, {
        method: 'DELETE'
      }).catch((error: unknown) => {
        this.logger.warn(
          { err: error, guildId: session.guildId },
          'Unable to delete Lavalink player'
        );
      });
    }
    session.adapter?.sendPayload({
      op: 4,
      d: { guild_id: session.guildId, channel_id: null, self_mute: false, self_deaf: true }
    });
    session.adapter?.destroy();
    session.adapter = undefined;
    session.current = undefined;
    session.queue = [];
    session.positionMs = 0;
    session.paused = false;
    session.voiceChannelId = undefined;
    session.state = 'DISCONNECTED';
    session.note = note;
    await this.refreshController(session);
  }

  private scheduleEmptyDisconnect(session: MusicSession): void {
    if (session.emptyTimer) return;
    session.note = `No human listeners remain. BLE Music will disconnect after ${Math.round(
      session.emptyTimeoutMs / 60_000
    )} minutes.`;
    session.emptyTimer = setTimeout(() => {
      session.emptyTimer = undefined;
      this.observeVoiceState(session.guildId);
      const channelId = session.voiceChannelId;
      const channel = channelId ? session.guild.channels.cache.get(channelId) : undefined;
      const humans = channel?.isVoiceBased()
        ? [...channel.members.values()].filter((member) => !member.user.bot).length
        : 0;
      if (humans === 0)
        void this.disconnectSession(session, 'Disconnected because the voice channel was empty.');
    }, session.emptyTimeoutMs);
    session.emptyTimer.unref();
    void this.refreshController(session);
  }

  private cancelEmptyDisconnect(session: MusicSession): void {
    if (!session.emptyTimer) return;
    clearTimeout(session.emptyTimer);
    session.emptyTimer = undefined;
    session.note = session.current
      ? 'A listener returned; empty-channel cleanup was cancelled.'
      : session.note;
    void this.refreshController(session);
  }

  private scheduleIdleDisconnect(session: MusicSession): void {
    if (session.idleTimer) return;
    session.idleTimer = setTimeout(() => {
      session.idleTimer = undefined;
      if (session.state === 'IDLE' && session.queue.length === 0)
        void this.disconnectSession(
          session,
          'Disconnected because the queue stayed inactive for 5 minutes.'
        );
    }, session.idleTimeoutMs);
    session.idleTimer.unref();
  }

  private cancelIdleDisconnect(session: MusicSession): void {
    if (!session.idleTimer) return;
    clearTimeout(session.idleTimer);
    session.idleTimer = undefined;
  }

  private view(session: MusicSession): MusicControllerView {
    return {
      guildId: session.guildId,
      ...(session.voiceChannelId ? { voiceChannelId: session.voiceChannelId } : {}),
      state: session.state,
      ...(session.current ? { current: session.current } : {}),
      queueLength: session.queue.length,
      volume: session.volume,
      loop: session.loop,
      positionMs: session.positionMs,
      previousAvailable: session.history.length > 0,
      skipAvailable: session.queue.length > 0,
      ...(session.note ? { note: session.note } : {})
    };
  }

  private async refreshController(session: MusicSession): Promise<void> {
    if (!session.controller) return;
    const channel = await this.client.channels.fetch(session.controller.channelId).catch(noOp);
    if (!channel?.isTextBased() || !('messages' in channel)) return;
    const message = await channel.messages.fetch(session.controller.messageId).catch(noOp);
    if (message) await message.edit(this.ui.musicController(this.view(session))).catch(noOp);
  }

  private async requestVoice(guild: Guild, channelId: string): Promise<VoiceDetails> {
    let server: Readonly<{ token: string; endpoint: string }> | undefined;
    let state: Readonly<{ sessionId: string; channelId: string }> | undefined;
    let resolveVoice: ((value: VoiceDetails) => void) | undefined;
    let rejectVoice: ((error: Error) => void) | undefined;
    const complete = (): void => {
      if (server && state && resolveVoice)
        resolveVoice({ ...server, sessionId: state.sessionId, channelId: state.channelId });
    };
    const adapter = guild.voiceAdapterCreator({
      onVoiceServerUpdate: (data) => {
        if (data.token && data.endpoint) {
          server = { token: data.token, endpoint: data.endpoint };
          complete();
        }
      },
      onVoiceStateUpdate: (data) => {
        if (data.user_id !== this.client.user?.id || !data.session_id || !data.channel_id) return;
        state = { sessionId: data.session_id, channelId: data.channel_id };
        complete();
      },
      destroy: () =>
        rejectVoice?.(new MusicServiceError('Discord voice signalling was interrupted.'))
    });
    const voice = await new Promise<VoiceDetails>((resolve, reject) => {
      resolveVoice = resolve;
      rejectVoice = reject;
      if (
        !adapter.sendPayload({
          op: 4,
          d: { guild_id: guild.id, channel_id: channelId, self_mute: false, self_deaf: true }
        })
      )
        reject(new MusicServiceError('BLE Bot could not request access to that voice channel.'));
      setTimeout(
        () =>
          reject(new MusicServiceError('Discord voice connection timed out. Please try again.')),
        15_000
      ).unref();
    }).catch((error: unknown) => {
      adapter.destroy();
      throw error;
    });
    const session = this.sessions.get(guild.id);
    if (session) session.adapter = adapter;
    return voice;
  }

  private async updatePlayer(
    session: MusicSession,
    body: Readonly<Record<string, unknown>>
  ): Promise<void> {
    await this.ensureNode();
    if (!this.lavalinkSessionId) throw new MusicServiceError('Lavalink session is not ready yet.');
    await this.rest(`/sessions/${this.lavalinkSessionId}/players/${session.guildId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  private async ensureNode(): Promise<void> {
    if (this.lavalinkSessionId && this.websocket?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;
    const userId = this.client.user?.id;
    if (!userId) throw new MusicServiceError('BLE Music is waiting for the Discord gateway.');
    const connecting = new Promise<void>((resolve, reject) => {
      const protocol = this.config.lavalink.secure ? 'wss' : 'ws';
      const socket = new WebSocket(
        `${protocol}://${this.config.lavalink.host}:${this.config.lavalink.port}/v4/websocket`,
        {
          headers: {
            Authorization: this.config.lavalink.password || 'change-me-before-production',
            'User-Id': userId,
            'Client-Name': 'ble-bot/0.1.0'
          }
        }
      );
      const timeout = setTimeout(
        () =>
          reject(new MusicServiceError('Lavalink did not become ready. Please try again shortly.')),
        10_000
      );
      timeout.unref();
      socket.once('error', (error: Error) => {
        clearTimeout(timeout);
        reject(new MusicServiceError('BLE Music cannot reach Lavalink.', error));
      });
      socket.on('close', () => {
        this.websocket = undefined;
        this.lavalinkSessionId = undefined;
      });
      socket.on('message', (message: WebSocket.RawData) => {
        const event = this.parseEvent(rawDataToText(message));
        if (!event) return;
        if (event.op === 'ready' && typeof event.sessionId === 'string') {
          clearTimeout(timeout);
          this.websocket = socket;
          this.lavalinkSessionId = event.sessionId;
          void this.rest(`/sessions/${event.sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resuming: true, timeout: 60 })
          }).catch((error: unknown) =>
            this.logger.warn({ err: error }, 'Unable to enable Lavalink session resuming')
          );
          resolve();
          return;
        }
        void this.handleNodeEvent(event);
      });
    }).finally(() => {
      this.connecting = undefined;
    });
    this.connecting = connecting;
    return connecting;
  }

  private parseEvent(input: string): Record<string, unknown> | undefined {
    try {
      const value: unknown = JSON.parse(input);
      return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }

  private async handleNodeEvent(event: Record<string, unknown>): Promise<void> {
    const guildId = typeof event.guildId === 'string' ? event.guildId : undefined;
    if (!guildId) return;
    const session = this.sessions.get(guildId);
    if (!session) return;
    if (event.op === 'playerUpdate' && event.state && typeof event.state === 'object') {
      const position = (event.state as Record<string, unknown>).position;
      if (typeof position === 'number') session.positionMs = position;
      return;
    }
    if (event.op !== 'event' || event.type !== 'TrackEndEvent') return;
    const reason = typeof event.reason === 'string' ? event.reason.toLowerCase() : '';
    if (reason === 'finished' || reason === 'loadfailed' || reason === 'stuck')
      await this.advance(session, 'Advanced to the next queued track.');
  }

  private async rest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    await this.ensureNode();
    const protocol = this.config.lavalink.secure ? 'https' : 'http';
    const response = await fetch(
      `${protocol}://${this.config.lavalink.host}:${this.config.lavalink.port}/v4${path}`,
      {
        ...init,
        headers: {
          Authorization: this.config.lavalink.password || 'change-me-before-production',
          ...(init.headers ?? {})
        }
      }
    ).catch((error: unknown) => {
      throw new MusicServiceError(
        'BLE Music cannot reach Lavalink.',
        error instanceof Error ? error : undefined
      );
    });
    if (!response.ok) {
      this.logger.warn({ status: response.status, path }, 'Lavalink request failed');
      throw new MusicServiceError(
        'BLE Music could not complete that request. Check that Lavalink sources are enabled.'
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
