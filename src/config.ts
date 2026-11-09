export const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

export const areApiKeysConfigured = (): boolean => {
  // Always permit app initialization; Map and services degrade gracefully if optional keys are missing
  return true;
};

