import type {
  ButtonInteraction,
  Interaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction
} from 'discord.js';

import type { ComponentHandler } from '../framework/component-handler.js';
import { ResourceNotFoundError } from '../../errors/domain-error.js';
import type { CommandRegistry } from '../framework/registry.js';
import type { Ui } from '../../ui/ui.js';
import {
  cycleHelpCategory,
  helpCategories,
  helpCategoryPage,
  helpHome,
  helpSearch,
  type HelpCategory
} from './help-view.js';

const helpPrefix = 'ble:help:';

const isValidCategory = (value: string): value is HelpCategory =>
  helpCategories.includes(value as HelpCategory);

export class HelpInteractionHandler implements ComponentHandler {
  public constructor(
    private readonly registry: CommandRegistry,
    private readonly ui: Ui
  ) {}

  public canHandle(interaction: Interaction): boolean {
    return (
      (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) &&
      interaction.customId.startsWith(helpPrefix)
    );
  }

  public async handle(interaction: Interaction): Promise<void> {
    if (interaction.isButton()) return this.handleButton(interaction);
    if (interaction.isStringSelectMenu()) return this.handleSelect(interaction);
    if (interaction.isModalSubmit()) return this.handleModal(interaction);
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    const [, , action] = interaction.customId.split(':');
    if (action === 'search') {
      await interaction.showModal(
        this.ui.searchModal({
          customId: 'ble:help:search-submit',
          title: 'Search BLE Help',
          label: 'Command or feature',
          placeholder: 'Example: ticket or backup'
        })
      );
      return;
    }
    if (action === 'home') {
      await interaction.update(helpHome(this.registry, this.ui));
      return;
    }
    if (action === 'setup') {
      await interaction.reply({
        embeds: [
          this.ui.page('info', {
            title: this.ui.labeled('Start BLE Setup', 'guide'),
            description:
              'Run `/setup start` to open the saved setup centre. It includes module navigation, diagnostics, and resumable progress.'
          })
        ],
        ephemeral: true
      });
      return;
    }
    if (action === 'previous' || action === 'next') {
      const current = this.categoryFromMessage(interaction);
      const category = cycleHelpCategory(current, action === 'next' ? 1 : -1);
      await interaction.update(helpCategoryPage(this.registry, this.ui, category));
      return;
    }
    throw new ResourceNotFoundError('This help control has expired.');
  }

  private async handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const selected = interaction.values[0];
    if (!selected || !isValidCategory(selected))
      throw new ResourceNotFoundError('This help category is no longer available.');
    await interaction.update(helpCategoryPage(this.registry, this.ui, selected));
  }

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.customId !== 'ble:help:search-submit')
      throw new ResourceNotFoundError('This help search has expired.');
    await interaction.reply({
      embeds: [helpSearch(this.registry, this.ui, interaction.fields.getTextInputValue('query'))],
      ephemeral: true
    });
  }

  private categoryFromMessage(interaction: ButtonInteraction): HelpCategory | undefined {
    const title = interaction.message.embeds[0]?.title;
    if (!title) return undefined;
    const normalized = title.toLowerCase();
    return helpCategories.find((category) => normalized.includes(category.replace('-', ' ')));
  }
}
