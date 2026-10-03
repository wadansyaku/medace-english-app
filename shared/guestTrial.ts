// Authored for the guest trial. No book, licensed workbook, AI, or catalogue data
// is used here. These IDs identify this static experience, never real words.
export const GUEST_TRIAL_VERSION = 'original-v1';
export const GUEST_TRIAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface GuestTrialQuestion {
  id: string;
  word: string;
  choices: readonly string[];
  correctChoiceIndex: number;
  explanation: string;
}

export const GUEST_TRIAL_QUESTIONS: readonly GuestTrialQuestion[] = [
  { id: 'original-v1-bright', word: 'bright', choices: ['明るい', '重い', '静かな', '遠い'], correctChoiceIndex: 0, explanation: 'bright は「明るい」。明るい部屋や光について使えます。' },
  { id: 'original-v1-carry', word: 'carry', choices: ['待つ', '運ぶ', '忘れる', '選ぶ'], correctChoiceIndex: 1, explanation: 'carry は「運ぶ」。物を持って別の場所へ移すときに使います。' },
  { id: 'original-v1-quiet', word: 'quiet', choices: ['忙しい', '新しい', '静かな', '丸い'], correctChoiceIndex: 2, explanation: 'quiet は「静かな」。音や声が少ない様子を表します。' },
  { id: 'original-v1-choose', word: 'choose', choices: ['走る', '閉じる', '洗う', '選ぶ'], correctChoiceIndex: 3, explanation: 'choose は「選ぶ」。いくつかの候補から決めるときに使います。' },
  { id: 'original-v1-share', word: 'share', choices: ['分け合う', '隠す', '壊す', '眠る'], correctChoiceIndex: 0, explanation: 'share は「分け合う」。物や時間をほかの人と一緒に使うことを表します。' },
];

export interface GuestTrialAnswer {
  attemptId: string;
  questionId: string;
  choiceIndex: number;
  answeredAt: number;
}

export const getGuestTrialQuestion = (questionId: string): GuestTrialQuestion | undefined => (
  GUEST_TRIAL_QUESTIONS.find((question) => question.id === questionId)
);

export const isGuestTrialAnswerCorrect = (answer: Pick<GuestTrialAnswer, 'questionId' | 'choiceIndex'>): boolean => (
  getGuestTrialQuestion(answer.questionId)?.correctChoiceIndex === answer.choiceIndex
);
