export interface FallbackSpecialty {
  name: string;
  reasoning: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface FallbackResult {
  specialties: FallbackSpecialty[];
  disclaimer: string;
}

const KEYWORD_SPECIALTY_MATRIX = [
  {
    specialty: 'Cardiology',
    keywords: ['heart', 'chest pain', 'palpitations', 'cardiac', 'pulse', 'high blood pressure', 'hypertension', 'angina', 'arrhythmia'],
    reasoning: 'Symptoms relate to the cardiovascular system.',
    urgency: 'HIGH' as const,
  },
  {
    specialty: 'Dermatology',
    keywords: ['skin', 'rash', 'itch', 'eczema', 'acne', 'mole', 'hives', 'lesion', 'burn', 'redness', 'dry skin', 'psoriasis'],
    reasoning: 'Symptoms involve skin irritation, rashes, or epidermal lesions.',
    urgency: 'LOW' as const,
  },
  {
    specialty: 'Neurology',
    keywords: ['headache', 'migraine', 'dizziness', 'seizure', 'numbness', 'tremor', 'paralysis', 'vertigo', 'tingling', 'fainting'],
    reasoning: 'Symptoms relate to the nervous system and brain function.',
    urgency: 'MEDIUM' as const,
  },
  {
    specialty: 'Pediatrics',
    keywords: ['child', 'baby', 'infant', 'toddler', 'pediatric', 'newborn'],
    reasoning: 'Symptoms concern a child or infant patient.',
    urgency: 'MEDIUM' as const,
  },
  {
    specialty: 'Orthopedics',
    keywords: ['bone', 'joint', 'fracture', 'sprain', 'knee', 'shoulder', 'back pain', 'muscle strain', 'arthritis', 'spine'],
    reasoning: 'Symptoms involve the musculoskeletal system.',
    urgency: 'LOW' as const,
  },
  {
    specialty: 'Gastroenterology',
    keywords: ['stomach', 'acid reflux', 'nausea', 'vomiting', 'diarrhea', 'constipation', 'abdomen', 'bloating', 'indigestion', 'heartburn'],
    reasoning: 'Symptoms relate to the gastrointestinal tract and digestive system.',
    urgency: 'LOW' as const,
  },
  {
    specialty: 'Pulmonology',
    keywords: ['cough', 'asthma', 'shortness of breath', 'breathing', 'wheezing', 'lung', 'bronchitis'],
    reasoning: 'Symptoms relate to the respiratory system and lungs.',
    urgency: 'MEDIUM' as const,
  },
  {
    specialty: 'Endocrinology',
    keywords: ['diabetes', 'thyroid', 'hormone', 'insulin', 'fatigue', 'weight loss', 'weight gain', 'goiter'],
    reasoning: 'Symptoms suggest metabolic or hormonal endocrine imbalance.',
    urgency: 'LOW' as const,
  },
  {
    specialty: 'Ophthalmology',
    keywords: ['eye', 'vision', 'blind', 'blurry', 'cataract', 'glaucoma', 'double vision'],
    reasoning: 'Symptoms involve vision or ocular health.',
    urgency: 'LOW' as const,
  },
  {
    specialty: 'Otolaryngology (ENT)',
    keywords: ['ear', 'nose', 'throat', 'sinus', 'tonsils', 'hearing', 'tinnitus', 'sore throat'],
    reasoning: 'Symptoms involve the ear, nose, throat, or sinuses.',
    urgency: 'LOW' as const,
  },
  {
    specialty: 'Psychiatry',
    keywords: ['depression', 'anxiety', 'panic attack', 'hallucination', 'mood swing', 'insomnia', 'suicidal', 'mental health'],
    reasoning: 'Symptoms relate to mental health or emotional distress.',
    urgency: 'MEDIUM' as const,
  }
];

const DEFAULT_FALLBACK: FallbackResult = {
  specialties: [
    {
      name: 'General Medicine',
      reasoning: 'Symptoms did not match specific specialty keywords; consulting a general practitioner is recommended for primary evaluation.',
      urgency: 'LOW',
    }
  ],
  disclaimer: 'This is a local keyword-based fallback recommendation and is not a substitute for professional medical advice.'
};

export function getLocalSymptomFallback(symptoms: string): FallbackResult {
  if (!symptoms || typeof symptoms !== 'string') {
    return DEFAULT_FALLBACK;
  }
  
  const query = symptoms.toLowerCase();
  const matchedSpecialties: FallbackSpecialty[] = [];
  
  for (const item of KEYWORD_SPECIALTY_MATRIX) {
    const matchedKeyword = item.keywords.find(kw => query.includes(kw));
    if (matchedKeyword) {
      matchedSpecialties.push({
        name: item.specialty,
        reasoning: `${item.reasoning} (Matched keyword: "${matchedKeyword}")`,
        urgency: item.urgency,
      });
    }
  }
  
  if (matchedSpecialties.length === 0) {
    return DEFAULT_FALLBACK;
  }
  
  return {
    specialties: matchedSpecialties,
    disclaimer: 'This is a local keyword-based fallback recommendation (due to temporary AI rate limits) and is not a substitute for professional medical advice.'
  };
}
