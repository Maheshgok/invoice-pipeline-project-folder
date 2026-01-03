// Feature configuration for the invoice processing system
// Controls which features are enabled/disabled

export interface FeatureConfig {
  accountCodes: {
    enabled: boolean;
    displayInTable: boolean;
    description: string;
  };
  // Add more feature toggles as needed
}

export const FEATURE_CONFIG: FeatureConfig = {
  accountCodes: {
    enabled: false, // Currently disabled - can be toggled when chart of accounts is provided
    displayInTable: false, // Hide account code column in tables when disabled
    description: "Account codes from chart of accounts. Enable when you have a standardized chart of accounts with codes."
  }
};

// Utility functions for feature checking
export const isFeatureEnabled = (feature: keyof FeatureConfig): boolean => {
  return FEATURE_CONFIG[feature]?.enabled || false;
};

export const shouldDisplayInTable = (feature: keyof FeatureConfig): boolean => {
  const featureConfig = FEATURE_CONFIG[feature];
  return featureConfig?.enabled && featureConfig?.displayInTable || false;
};

// Function to toggle features (for future admin panel)
export const toggleFeature = (feature: keyof FeatureConfig, enabled: boolean): void => {
  if (FEATURE_CONFIG[feature]) {
    FEATURE_CONFIG[feature].enabled = enabled;
    FEATURE_CONFIG[feature].displayInTable = enabled; // Auto-sync display with enabled state
  }
};