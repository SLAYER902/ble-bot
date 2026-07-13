export type MusicLoopMode = 'OFF' | 'TRACK' | 'QUEUE';

export type MusicTrack = Readonly<{
  encoded: string;
  title: string;
  author: string;
  durationMs: number;
  uri?: string;
  artworkUrl?: string;
  isSeekable: boolean;
  requestedBy: string;
}>;

export type MusicSearchResult = Omit<MusicTrack, 'requestedBy'>;

export type MusicControllerView = Readonly<{
  guildId: string;
  voiceChannelId?: string;
  state: 'PLAYING' | 'PAUSED' | 'IDLE' | 'DISCONNECTED';
  current?: MusicTrack;
  queueLength: number;
  volume: number;
  loop: MusicLoopMode;
  positionMs: number;
  previousAvailable: boolean;
  skipAvailable: boolean;
  note?: string;
}>;
