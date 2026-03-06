import { SubscriptionPlan } from '../types';

export type MeteredAiAction =
  | 'generateGeminiSentence'
  | 'generateWordImage'
  | 'generateAIQuiz'
  | 'extractVocabularyFromText'
  | 'extractVocabularyFromMedia'
  | 'generateLearningPlan'
  | 'generateInstructorFollowUp';

export interface SubscriptionPolicy {
  plan: SubscriptionPlan;
  label: string;
  audienceLabel: string;
  priceLabel: string;
  pricingNote: string;
  monthlyAiBudgetMilliYen: number;
  allowedAiActions: MeteredAiAction[];
  featureSummary: string[];
}

export interface AiActionEstimate {
  label: string;
  estimatedCostMilliYen: number;
  model: string;
}

export const SUBSCRIPTION_POLICIES: Record<SubscriptionPlan, SubscriptionPolicy> = {
  [SubscriptionPlan.TOC_FREE]: {
    plan: SubscriptionPlan.TOC_FREE,
    label: 'フリープラン',
    audienceLabel: '個人向け',
    priceLabel: '無料',
    pricingNote: '広告付きのセルフサーブ導線。公式教材カタログは含みません',
    monthlyAiBudgetMilliYen: 1200,
    allowedAiActions: ['generateGeminiSentence', 'generateAIQuiz'],
    featureSummary: [
      '自分で作成した教材と通常学習を無理なく始められます',
      'AIは例文生成と小さなクイズ補助を中心に使えます',
      '公式教材カタログは含めず、低コスト運用を優先します',
    ],
  },
  [SubscriptionPlan.TOC_PAID]: {
    plan: SubscriptionPlan.TOC_PAID,
    label: 'パーソナルプラン',
    audienceLabel: '個人向け',
    priceLabel: '月額課金想定',
    pricingNote: '広告なしの個人向け拡張プラン。公式教材カタログは含みません',
    monthlyAiBudgetMilliYen: 12000,
    allowedAiActions: [
      'generateGeminiSentence',
      'generateAIQuiz',
      'extractVocabularyFromText',
      'extractVocabularyFromMedia',
      'generateLearningPlan',
    ],
    featureSummary: [
      '個人向けのAI教材化と学習プラン作成まで利用できます',
      '画像やPDFからの抽出にも対応します',
      '公式教材ではなく、自作教材中心で学習を広げます',
    ],
  },
  [SubscriptionPlan.TOB_FREE]: {
    plan: SubscriptionPlan.TOB_FREE,
    label: 'ビジネスフリープラン',
    audienceLabel: '教室・法人向け',
    priceLabel: '無料トライアル',
    pricingNote: '導入検証用。正式教材カタログと権限運用は本導入前提',
    monthlyAiBudgetMilliYen: 8000,
    allowedAiActions: [
      'generateGeminiSentence',
      'generateAIQuiz',
      'generateLearningPlan',
      'generateInstructorFollowUp',
    ],
    featureSummary: [
      '講師フォロー通知の下書きを限定的に使えます',
      '導入前の検証に必要な範囲へ絞っています',
      '正式教材カタログは本導入後に開放します',
    ],
  },
  [SubscriptionPlan.TOB_PAID]: {
    plan: SubscriptionPlan.TOB_PAID,
    label: 'ビジネスプラン',
    audienceLabel: '教室・法人向け',
    priceLabel: '月額 + 導入費',
    pricingNote: '固定費1万円 + 生徒1人2,000円 + 講師1人500円 + 導入費60万円',
    monthlyAiBudgetMilliYen: 40000,
    allowedAiActions: [
      'generateGeminiSentence',
      'generateAIQuiz',
      'extractVocabularyFromText',
      'extractVocabularyFromMedia',
      'generateLearningPlan',
      'generateInstructorFollowUp',
    ],
    featureSummary: [
      '講師フォロー通知と正式教材カタログをどちらも使えます',
      '教室運用に必要なAI利用枠を広めに確保します',
      '高コスト機能も月次の利用枠で自動調整します',
    ],
  },
};

export const AI_ACTION_ESTIMATES: Record<MeteredAiAction, AiActionEstimate> = {
  generateGeminiSentence: {
    label: '例文生成',
    estimatedCostMilliYen: 120,
    model: 'gemini-2.5-flash',
  },
  generateWordImage: {
    label: '画像生成',
    estimatedCostMilliYen: 2400,
    model: 'imagen-4.0-generate-001',
  },
  generateAIQuiz: {
    label: 'AIクイズ',
    estimatedCostMilliYen: 220,
    model: 'gemini-2.5-flash',
  },
  extractVocabularyFromText: {
    label: 'テキスト抽出',
    estimatedCostMilliYen: 650,
    model: 'gemini-2.5-flash',
  },
  extractVocabularyFromMedia: {
    label: '画像/PDF抽出',
    estimatedCostMilliYen: 1100,
    model: 'gemini-2.5-flash',
  },
  generateLearningPlan: {
    label: '学習プラン生成',
    estimatedCostMilliYen: 380,
    model: 'gemini-2.5-flash',
  },
  generateInstructorFollowUp: {
    label: '講師フォロー通知',
    estimatedCostMilliYen: 260,
    model: 'gemini-2.5-flash',
  },
};

export const getSubscriptionPolicy = (plan: SubscriptionPlan | null | undefined): SubscriptionPolicy => {
  return SUBSCRIPTION_POLICIES[plan || SubscriptionPlan.TOC_FREE];
};

export const isBusinessPlan = (plan: SubscriptionPlan | null | undefined): boolean => {
  return plan === SubscriptionPlan.TOB_FREE || plan === SubscriptionPlan.TOB_PAID;
};

export const isPaidPlan = (plan: SubscriptionPlan | null | undefined): boolean => {
  return plan === SubscriptionPlan.TOC_PAID || plan === SubscriptionPlan.TOB_PAID;
};

export const isAdSupportedPlan = (plan: SubscriptionPlan | null | undefined): boolean => {
  return plan === SubscriptionPlan.TOC_FREE;
};
