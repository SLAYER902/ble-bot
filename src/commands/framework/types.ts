import type {
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  PermissionResolvable,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

export type CommandCategory =
  | 'security'
  | 'backup'
  | 'moderation'
  | 'management'
  | 'community'
  | 'utility'
  | 'music'
  | 'ai'
  | 'developer';
export type PremiumTier = 'free' | 'pro' | 'enterprise';
export type ChatCommandBuilder =
  SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;

export type CommandMetadata = Readonly<{
  name: string;
  category: CommandCategory;
  summary: string;
  longDescription: string;
  examples: readonly string[];
  requiredUserPermissions: readonly PermissionResolvable[];
  requiredBotPermissions: readonly PermissionResolvable[];
  defaultCooldownSeconds: number;
  premiumTier: PremiumTier;
  guildOnly: boolean;
  ownerOnly: boolean;
  hidden: boolean;
  dangerous: boolean;
  confirmationRequired: boolean;
  ephemeral?: boolean;
  aliases?: readonly string[];
}>;

export type CommandContext = Readonly<{
  interaction: ChatInputCommandInteraction;
  traceId: string;
}>;

export interface Command {
  readonly metadata: CommandMetadata;
  readonly data: ChatCommandBuilder | ContextMenuCommandBuilder;
  execute(context: CommandContext): Promise<void>;
}
