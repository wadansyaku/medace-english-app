import { SubscriptionPlan } from '../types';

export type MeteredAiAction =
  | 'generateGeminiSentence'
  | 'generateWordImage'
  | 'generateAIQuiz'
  | 'generateDiagnosticTest'
  | 'generateAdvancedDiagnosticTest'
  | 'evaluateAdvancedTest'
  | 'extractVocabularyFromText'
  | 'extractVocabularyFromMedia'
  | 'generateLearningPlan'
  | 'generateInstructorFollowUp'
  | 'generateWritingPrompt'
  | 'ocrWritingSubmission'
  | 'evaluateWritingSubmission';

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
    pricingNote: '広告付きのセルフサーブ導線。スターター公式教材と基本学習を利用できます',
    monthlyAiBudgetMilliYen: 1200,
    allowedAiActions: ['generateGeminiSentence', 'generateAIQuiz', 'generateDiagnosticTest'],
    featureSummary: [
      'オリジナル単語データベースのスターター教材と通常学習を無理なく始められます',
      '学習プランはAIではなく標準ロジックで自動提案します',
      'AIは例文生成と小さなクイズ補助を中心に使えます',
      'フルの既存公式教材カタログは含めず、低コスト運用を優先します',
    ],
  },
  [SubscriptionPlan.TOC_PAID]: {
    plan: SubscriptionPlan.TOC_PAID,
    label: 'パーソナルプラン',
    audienceLabel: '個人向け',
    priceLabel: '月額課金想定',
    pricingNote: '広告なしの個人向け拡張プラン。スターター公式教材に加えてAI教材化まで利用できます',
    monthlyAiBudgetMilliYen: 12000,
    allowedAiActions: [
      'generateGeminiSentence',
      'generateWordImage',
      'generateAIQuiz',
      'generateDiagnosticTest',
      'generateAdvancedDiagnosticTest',
      'evaluateAdvancedTest',
      'extractVocabularyFromText',
      'extractVocabularyFromMedia',
      'generateLearningPlan',
    ],
    featureSummary: [
      'スターター公式教材に加えて、個人向けのAI教材化と学習プラン作成まで利用できます',
      '画像やPDFからの抽出にも対応します',
      'フルの既存公式教材ではなく、自作教材とスターター教材中心で学習を広げます',
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
      'generateWordImage',
      'generateAIQuiz',
      'generateDiagnosticTest',
      'generateAdvancedDiagnosticTest',
      'evaluateAdvancedTest',
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
    priceLabel: '個別ご案内',
    pricingNote: '費用は導入規模に応じて個別にご案内します。導入費と管理・アップデート費は現時点では未定です。',
    monthlyAiBudgetMilliYen: 40000,
    allowedAiActions: [
      'generateGeminiSentence',
      'generateWordImage',
      'generateAIQuiz',
      'generateDiagnosticTest',
      'generateAdvancedDiagnosticTest',
      'evaluateAdvancedTest',
      'extractVocabularyFromText',
      'extractVocabularyFromMedia',
      'generateLearningPlan',
      'generateInstructorFollowUp',
      'generateWritingPrompt',
      'ocrWritingSubmission',
      'evaluateWritingSubmission',
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
  generateDiagnosticTest: {
    label: '標準診断テスト生成',
    estimatedCostMilliYen: 260,
    model: 'gemini-2.5-flash',
  },
  generateAdvancedDiagnosticTest: {
    label: 'アドバンス診断生成',
    estimatedCostMilliYen: 1800,
    model: 'gemini-3-pro-preview',
  },
  evaluateAdvancedTest: {
    label: 'アドバンス診断採点',
    estimatedCostMilliYen: 1400,
    model: 'gemini-3-pro-preview',
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
  generateWritingPrompt: {
    label: '自由英作文問題生成',
    estimatedCostMilliYen: 420,
    model: 'writing-provider-router',
  },
  ocrWritingSubmission: {
    label: '自由英作文OCR',
    estimatedCostMilliYen: 650,
    model: 'writing-provider-router',
  },
  evaluateWritingSubmission: {
    label: '自由英作文添削',
    estimatedCostMilliYen: 980,
    model: 'writing-provider-router',
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
