import type { Command } from '../framework/types.js';
import type { CommandRegistry } from '../framework/registry.js';
import type { Ui } from '../../ui/ui.js';

export const helpCategories = [
  'getting-started',
  'security',
  'moderation',
  'tickets',
  'roles',
  'welcome',
  'music',
  'voice',
  'backups',
  'ai',
  'utilities',
  'premium'
] as const;

export type HelpCategory = (typeof helpCategories)[number];

const categoryDetails: Readonly<
  Record<HelpCategory, Readonly<{ label: string; description: string }>>
> = {
  'getting-started': {
    label: 'Getting Started',
    description: 'Start with configuration and safe diagnostics.'
  },
  security: { label: 'Security', description: 'BLE Shield monitoring and incident safety.' },
  moderation: {
    label: 'Moderation',
    description: 'Authorized member moderation and case history.'
  },
  tickets: {
    label: 'Tickets',
    description: 'Private support tickets and persistent intake panels.'
  },
  roles: { label: 'Roles', description: 'Safe role changes and hierarchy checks.' },
  welcome: { label: 'Welcome', description: 'Member welcome and automation configuration.' },
  music: { label: 'Music', description: 'Playback controls and safe player lifecycle.' },
  voice: { label: 'Voice', description: 'Temporary voice channel management.' },
  backups: { label: 'Backups', description: 'Structural recovery snapshots and previews.' },
  ai: { label: 'AI', description: 'Optional AI services and managed credits.' },
  utilities: { label: 'Utilities', description: 'Safe operational tools and timestamps.' },
  premium: { label: 'Premium', description: 'Plan limits and capacity improvements.' }
};

const categoryForCommand = (command: Command): HelpCategory | undefined => {
  if (command.metadata.name === 'help' || command.metadata.name === 'setup')
    return 'getting-started';
  if (command.metadata.name === 'ticket') return 'tickets';
  if (command.metadata.name === 'role') return 'roles';
  if (command.metadata.name === 'premium') return 'premium';
  if (command.metadata.category === 'backup') return 'backups';
  if (command.metadata.category === 'moderation') return 'moderation';
  if (command.metadata.category === 'security') return 'security';
  if (command.metadata.category === 'utility') return 'utilities';
  if (command.metadata.category === 'music') return 'music';
  if (command.metadata.category === 'ai') return 'ai';
  return undefined;
};

const navigation = (ui: Ui) =>
  ui.navigation({
    selectId: 'ble:help:category',
    placeholder: 'Choose a command category',
    options: helpCategories.map((category) => ({
      label: categoryDetails[category].label,
      value: category,
      description: categoryDetails[category].description
    })),
    previousId: 'ble:help:previous',
    nextId: 'ble:help:next',
    homeId: 'ble:help:home',
    setupId: 'ble:help:setup',
    searchId: 'ble:help:search'
  });

const visibleCommands = (registry: CommandRegistry): readonly Command[] =>
  registry.all().filter((command) => !command.metadata.hidden);

export const helpHome = (registry: CommandRegistry, ui: Ui) => {
  const commands = visibleCommands(registry);
  return {
    embeds: [
      ui.page('info', {
        title: ui.labeled('BLE Command Centre', 'settings'),
        description:
          'Choose a category to view concise command details, permissions, examples, and plan availability.',
        fields: helpCategories.map((category) => {
          const count = commands.filter(
            (command) => categoryForCommand(command) === category
          ).length;
          return {
            name: categoryDetails[category].label,
            value: count
              ? `${count} available command ${count === 1 ? 'family' : 'families'}.`
              : 'Not registered until safely implemented.',
            inline: true
          };
        }),
        footer:
          'BLE Help only lists safely registered commands. Missing modules are never represented as working.'
      })
    ],
    components: navigation(ui)
  };
};

export const helpCategoryPage = (registry: CommandRegistry, ui: Ui, category: HelpCategory) => {
  const commands = visibleCommands(registry).filter(
    (command) => categoryForCommand(command) === category
  );
  const info = categoryDetails[category];
  return {
    embeds: [
      ui.page('info', {
        title: ui.labeled(info.label, 'information'),
        description: commands.length
          ? info.description
          : `${info.description}\n\nNo command is registered for this category yet.`,
        fields: commands.length
          ? commands.map((command) => ({
              name: `/${command.metadata.name}`,
              value: [
                command.metadata.summary,
                `Example: ${command.metadata.examples[0] ?? `/${command.metadata.name}`}`,
                `Permissions: ${command.metadata.requiredUserPermissions.length ? 'Required' : 'None'}`,
                `BLE permissions: ${command.metadata.requiredBotPermissions.length ? 'Required' : 'None'}`,
                `Cooldown: ${command.metadata.defaultCooldownSeconds}s | Plan: ${command.metadata.premiumTier}`
              ].join('\n')
            }))
          : [
              {
                name: 'Availability',
                value: 'BLE does not expose incomplete or placeholder commands.'
              }
            ]
      })
    ],
    components: navigation(ui)
  };
};

export const helpSearch = (registry: CommandRegistry, ui: Ui, query: string) => {
  const normalized = query.trim().toLowerCase();
  const matches = visibleCommands(registry).filter((command) =>
    [command.metadata.name, command.metadata.summary, command.metadata.longDescription]
      .join(' ')
      .toLowerCase()
      .includes(normalized)
  );
  return ui.page('info', {
    title: ui.labeled('Help search results', 'search'),
    description: matches.length
      ? `Matches for: ${query}`
      : `No registered commands match: ${query}`,
    fields: matches.slice(0, 10).map((command) => ({
      name: `/${command.metadata.name}`,
      value: `${command.metadata.summary}\nExample: ${command.metadata.examples[0] ?? `/${command.metadata.name}`}`
    }))
  });
};

export const cycleHelpCategory = (
  category: HelpCategory | undefined,
  offset: number
): HelpCategory => {
  const current = category ? helpCategories.indexOf(category) : 0;
  const next = (current + offset + helpCategories.length) % helpCategories.length;
  return helpCategories[next] ?? 'getting-started';
};
