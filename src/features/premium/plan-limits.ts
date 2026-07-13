export type BlePlan = 'FREE' | 'PREMIUM';

export type PlanLimits = Readonly<{
  ticketPanels: number;
  ticketTypesPerPanel: number;
  openTicketsPerUser: number;
  transcriptRetentionDays: number;
  rolePanels: number;
  scheduledBackups: number;
  manualBackupsStored: number;
  backupRetentionDays: number;
  aiCreditsMonthly: number;
  musicQueueLength: number;
  musicEmptyChannelTimeoutMinutes: number;
  musicIdleTimeoutMinutes: number;
  voiceTemplates: number;
  analyticsRetentionDays: number;
}>;

export const PLAN_LIMITS: Readonly<Record<BlePlan, PlanLimits>> = {
  FREE: {
    ticketPanels: 1,
    ticketTypesPerPanel: 3,
    openTicketsPerUser: 2,
    transcriptRetentionDays: 7,
    rolePanels: 2,
    scheduledBackups: 0,
    manualBackupsStored: 2,
    backupRetentionDays: 7,
    aiCreditsMonthly: 10,
    musicQueueLength: 50,
    musicEmptyChannelTimeoutMinutes: 3,
    musicIdleTimeoutMinutes: 5,
    voiceTemplates: 1,
    analyticsRetentionDays: 7
  },
  PREMIUM: {
    ticketPanels: 10,
    ticketTypesPerPanel: 20,
    openTicketsPerUser: 10,
    transcriptRetentionDays: 90,
    rolePanels: 20,
    scheduledBackups: 5,
    manualBackupsStored: 30,
    backupRetentionDays: 90,
    aiCreditsMonthly: 250,
    musicQueueLength: 500,
    musicEmptyChannelTimeoutMinutes: 15,
    musicIdleTimeoutMinutes: 20,
    voiceTemplates: 20,
    analyticsRetentionDays: 90
  }
};

export const planFromStoredTier = (tier: 'FREE' | 'PRO' | 'ENTERPRISE'): BlePlan =>
  tier === 'FREE' ? 'FREE' : 'PREMIUM';
