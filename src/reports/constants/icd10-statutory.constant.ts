export const STATUTORY_DISEASE_MAP: Record<string, string> = {
  'A00': 'Cholera',
  'A01': 'Typhoid and paratyphoid fevers',
  'A03': 'Shigellosis',
  'A09': 'Infectious gastroenteritis',
  'A15': 'Respiratory tuberculosis',
  'A20': 'Plague',
  'A39': 'Meningococcal infection',
  'A80': 'Acute poliomyelitis',
  'B01': 'Varicella (Chickenpox)',
  'B05': 'Measles',
  'B50': 'Plasmodium falciparum malaria',
  'B51': 'Plasmodium vivax malaria',
  'B52': 'Plasmodium malariae malaria',
  'B53': 'Other parasitologically confirmed malaria',
  'B54': 'Unspecified malaria',
  'B74': 'Filariasis',
  'J09': 'Influenza due to identified zoonotic or pandemic virus',
  'U07': 'Emergency use of U07 (COVID-19)',
};

/**
 * Extracts the base category (first 3 characters) and checks if it requires reporting.
 */
export const isStatutoryDisease = (icd10Code: string): boolean => {
  if (!icd10Code) return false;
  const categoryCode = icd10Code.substring(0, 3).toUpperCase();
  return Object.keys(STATUTORY_DISEASE_MAP).includes(categoryCode);
};

/**
 * Returns the standardized MOH disease name for the given ICD-10 code.
 */
export const getDiseaseCategory = (icd10Code: string): string | null => {
  if (!icd10Code) return null;
  const categoryCode = icd10Code.substring(0, 3).toUpperCase();
  return STATUTORY_DISEASE_MAP[categoryCode] || null;
};