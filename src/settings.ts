import { App, PluginSettingTab, Setting } from 'obsidian';
import type BudgetFlowPlugin from './main';
import {
  DEFAULT_MOBILE_UI_SCALE,
  MAX_MOBILE_UI_SCALE,
  MIN_MOBILE_UI_SCALE,
  normalizeMobileUiScale
} from './mobileUiScale';

export interface BudgetFlowSettings {
  defaultIncome: number;
  showPieChartByDefault: boolean;
  chartSize: 'small' | 'medium' | 'large';
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  decimalPlaces: number;
  defaultCategories: string[];
  colorScheme: 'default' | 'monochrome' | 'pastel';
  mobileUiScale: number;
  mobileEdgeIconY?: number;
}

export const DEFAULT_SETTINGS: BudgetFlowSettings = {
  defaultIncome: 0,
  showPieChartByDefault: true,
  chartSize: 'medium',
  currencySymbol: '$',
  currencyPosition: 'before',
  decimalPlaces: 0,
  defaultCategories: ['Savings', 'Investments', 'Fixed Expenses', 'Subscriptions', 'Discretionary'],
  colorScheme: 'default',
  mobileUiScale: DEFAULT_MOBILE_UI_SCALE,
};

export class BudgetFlowSettingTab extends PluginSettingTab {
  plugin: BudgetFlowPlugin;

  constructor(app: App, plugin: BudgetFlowPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Budget Flow Settings' });

    // Currency Section
    containerEl.createEl('h3', { text: 'Currency' });

    new Setting(containerEl)
      .setName('Currency symbol')
      .setDesc('Symbol to display with amounts (e.g., $, €, £)')
      .addText((text) =>
        text
          .setPlaceholder('$')
          .setValue(this.plugin.settings.currencySymbol)
          .onChange(async (value) => {
            this.plugin.settings.currencySymbol = value || '$';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Currency position')
      .setDesc('Show currency symbol before or after the amount')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('before', 'Before ($100)')
          .addOption('after', 'After (100$)')
          .setValue(this.plugin.settings.currencyPosition)
          .onChange(async (value: 'before' | 'after') => {
            this.plugin.settings.currencyPosition = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Decimal places')
      .setDesc('Number of decimal places to show')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('0', '0 ($100)')
          .addOption('2', '2 ($100.00)')
          .setValue(String(this.plugin.settings.decimalPlaces))
          .onChange(async (value) => {
            this.plugin.settings.decimalPlaces = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    // Display Section
    containerEl.createEl('h3', { text: 'Display' });

    new Setting(containerEl)
      .setName('Default income')
      .setDesc('Pre-fill this income when creating new budgets')
      .addText((text) =>
        text
          .setPlaceholder('0')
          .setValue(String(this.plugin.settings.defaultIncome))
          .onChange(async (value) => {
            const num = parseInt(value) || 0;
            this.plugin.settings.defaultIncome = num;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show pie chart by default')
      .setDesc('Display the allocation chart when opening budget files')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showPieChartByDefault)
          .onChange(async (value) => {
            this.plugin.settings.showPieChartByDefault = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Chart size')
      .setDesc('Size of the pie chart')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('small', 'Small (200px)')
          .addOption('medium', 'Medium (300px)')
          .addOption('large', 'Large (400px)')
          .setValue(this.plugin.settings.chartSize)
          .onChange(async (value: 'small' | 'medium' | 'large') => {
            this.plugin.settings.chartSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Color scheme')
      .setDesc('Color palette for the pie chart')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('default', 'Default (Vibrant)')
          .addOption('pastel', 'Pastel')
          .addOption('monochrome', 'Monochrome')
          .setValue(this.plugin.settings.colorScheme)
          .onChange(async (value: 'default' | 'monochrome' | 'pastel') => {
            this.plugin.settings.colorScheme = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Mobile UI scale')
      .setDesc('Pinch zoom baseline on mobile devices (50% to 135%)')
      .addSlider((slider) =>
        slider
          .setLimits(MIN_MOBILE_UI_SCALE, MAX_MOBILE_UI_SCALE, 0.01)
          .setDynamicTooltip()
          .setValue(normalizeMobileUiScale(this.plugin.settings.mobileUiScale))
          .onChange(async (value) => {
            this.plugin.settings.mobileUiScale = normalizeMobileUiScale(value);
            await this.plugin.saveSettings();
          })
      );

    // Categories Section
    containerEl.createEl('h3', { text: 'Default Categories' });

    new Setting(containerEl)
      .setName('Default categories')
      .setDesc('Categories to include in new budgets (comma-separated)')
      .addTextArea((text) =>
        text
          .setPlaceholder('Savings, Investments, Fixed Expenses...')
          .setValue(this.plugin.settings.defaultCategories.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.defaultCategories = value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          })
      );
  }
}
