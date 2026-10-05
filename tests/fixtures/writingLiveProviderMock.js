// Test-only provider response generator. The local runner copies this module
// into its temporary Functions tree; production source never imports it.
// A "live" provenance in this runtime tests the contract, not a real AI call.
export const Type = Object.freeze({
  ARRAY: 'ARRAY', NUMBER: 'NUMBER', OBJECT: 'OBJECT', STRING: 'STRING',
});

const hasRequiredKeys = (keys, expected) => Array.isArray(keys)
  && keys.length === expected.length
  && expected.every((key) => keys.includes(key));

const syntheticResponse = (request) => {
  if (request?.model !== 'gemini-2.5-flash'
    || request.config?.responseMimeType !== 'application/json') {
    throw new Error('Unsupported writing provider mock request.');
  }
  const keys = request.config.responseSchema?.required;
  if (hasRequiredKeys(keys, ['promptTitle', 'promptText', 'guidance'])) {
    const topic = typeof request.contents === 'string'
      ? request.contents.match(/Topic hint:\s*([^\n]+)/)?.[1]?.trim() : undefined;
    return {
      promptTitle: `Synthetic writing task: ${topic || 'school tablet use'}`,
      promptText: 'Do you think students should use tablets in class? Give your opinion and two reasons.',
      guidance: 'Write your opinion with two reasons and an example.',
    };
  }
  if (hasRequiredKeys(keys, ['transcript', 'confidence'])) {
    if (!Array.isArray(request.contents) || !request.contents.some((part) => part.inlineData?.data)) {
      throw new Error('Writing OCR mock requires an uploaded test asset.');
    }
    return {
      transcript: 'I agree that students should use tablets in class because they can review lessons quickly and share ideas more easily. First, they can check their notes at home and ask better questions in class. Second, they can compare different ideas with their classmates. For example, a shared document helps everyone prepare for a group project. However, teachers should give clear rules so students do not lose focus. For these reasons, tablets can support classroom learning.',
      confidence: 0.96,
    };
  }
  if (hasRequiredKeys(keys, ['strengths', 'improvementPoints', 'correctedDraft', 'modelAnswer'])) {
    const draft = typeof request.contents === 'string'
      ? request.contents.match(/Submission:\s*([\s\S]*?)\n\s*Return JSON with:/)?.[1]?.trim() : undefined;
    if (!draft) throw new Error('Writing evaluation mock requires a test transcript.');
    return {
      strengths: ['合成応答: 主張が明確です。', '合成応答: 理由と例を挙げています。'],
      improvementPoints: ['合成応答: 接続表現を確認しましょう。'],
      correctedDraft: draft,
      modelAnswer: 'I agree that tablets can help students review lessons and share useful ideas when teachers provide clear rules.',
    };
  }
  throw new Error('Unsupported writing provider mock schema.');
};

export class GoogleGenAI {
  constructor(options) {
    if (options?.apiKey !== 'synthetic-writing-test-key') {
      throw new Error('The writing provider mock accepts only its synthetic test key.');
    }
  }

  models = {
    generateContent: async (request) => ({ text: JSON.stringify(syntheticResponse(request)) }),
  };
}
