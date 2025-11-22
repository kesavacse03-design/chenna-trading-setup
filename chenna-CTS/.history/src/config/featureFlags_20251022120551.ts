// Centralized feature flags

export const featureFlags = {
  enableNewDashboard: process.env.ENABLE_NEW_DASHBOARD === 'true',
  useExperimentalCharts: process.env.USE_EXPERIMENTAL_CHARTS === 'true',
  showBetaBanner: process.env.SHOW_BETA_BANNER === 'true',
};

// Optional helper
export const isFeatureEnabled = (flag: keyof typeof featureFlags): boolean => {
  return featureFlags[flag];
};
