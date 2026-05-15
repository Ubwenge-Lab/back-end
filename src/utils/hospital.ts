/**
 * Generates a unique Medical Record Number (MRN)
 * Format: NC-2026-XXXX (EV for E-Vuze)
 */
export const generateMRN = (): string => {
  const year = new Date().getFullYear();
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `EV-${year}-${randomSuffix}`;
};
