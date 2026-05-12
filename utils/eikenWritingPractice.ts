export type EikenWritingLevel = 'grade-3' | 'pre-2' | 'grade-2' | 'pre-1';

export type EikenWritingTaskType = 'email' | 'opinion' | 'summary';

export interface EikenWritingWordRange {
  min: number;
  max: number;
}

export interface EikenWritingTask {
  id: string;
  level: EikenWritingLevel;
  taskType: EikenWritingTaskType;
  titleJa: string;
  promptEn: string;
  promptJa: string;
  wordRange: EikenWritingWordRange;
  focusPoints: string[];
  checklist: string[];
  sourceInspiration: string;
}

export interface GetEikenWritingTasksOptions {
  level?: EikenWritingLevel;
  taskType?: EikenWritingTaskType;
  maxTasks?: number;
}

export const EIKEN_WRITING_LEVEL_LABELS: Record<EikenWritingLevel, string> = {
  'grade-3': '英検3級',
  'pre-2': '英検準2級',
  'grade-2': '英検2級',
  'pre-1': '英検準1級',
};

export const EIKEN_WRITING_TASK_TYPE_LABELS: Record<EikenWritingTaskType, string> = {
  email: 'Eメール返信',
  opinion: '意見論述',
  summary: '要約',
};

export const EIKEN_WRITING_TASKS: EikenWritingTask[] = [
  {
    id: 'grade3-email-school-festival',
    level: 'grade-3',
    taskType: 'email',
    titleJa: '学校祭の手伝い',
    promptEn: 'You received an email from an exchange student who wants to help at your school festival. Write a reply. Answer the student\'s two questions and ask one question about what the student likes to do.',
    promptJa: '学校祭を手伝いたい留学生への返信です。相手の2つの質問に答え、好きな活動について1つ質問しましょう。',
    wordRange: { min: 25, max: 35 },
    focusPoints: ['質問への直接回答', '相手への質問', '基本時制'],
    checklist: ['2つの質問に答えた', '最後に1つ質問した', 'あいさつと結びを書いた'],
    sourceInspiration: 'eiken-official-grade3-writing',
  },
  {
    id: 'grade3-email-weekend-plan',
    level: 'grade-3',
    taskType: 'email',
    titleJa: '週末の予定',
    promptEn: 'Your friend from Canada asks about your weekend. Write an email reply. Tell your friend where you will go and why you want to go there. Ask one question about your friend\'s weekend.',
    promptJa: 'カナダの友人に週末の予定を返信します。行く場所と理由を書き、相手の週末について1つ質問しましょう。',
    wordRange: { min: 25, max: 35 },
    focusPoints: ['未来表現', '理由の説明', '自然な質問'],
    checklist: ['行き先を書いた', '理由を because などで説明した', '相手への質問がある'],
    sourceInspiration: 'eiken-official-grade3-writing',
  },
  {
    id: 'grade3-email-favorite-lunch',
    level: 'grade-3',
    taskType: 'email',
    titleJa: '好きな昼食',
    promptEn: 'Your host family asks what lunch you like. Write an email reply. Explain your favorite lunch and when you usually eat it. Ask one question about food in their home.',
    promptJa: 'ホームステイ先に好きな昼食を伝える返信です。好きな昼食と食べる場面を書き、相手の家の食べ物について1つ質問しましょう。',
    wordRange: { min: 25, max: 35 },
    focusPoints: ['好みの表現', '頻度や場面', '食べ物語彙'],
    checklist: ['好きな昼食を書いた', 'いつ食べるかを書いた', '相手の食事について質問した'],
    sourceInspiration: 'eiken-official-grade3-writing',
  },
  {
    id: 'grade3-opinion-reading-books',
    level: 'grade-3',
    taskType: 'opinion',
    titleJa: '本を読むこと',
    promptEn: 'Do you think students should read books every week? Give your opinion and two reasons.',
    promptJa: '生徒は毎週本を読むべきだと思いますか。自分の意見と理由を2つ書きましょう。',
    wordRange: { min: 25, max: 35 },
    focusPoints: ['立場の明示', '理由2つ', '身近な例'],
    checklist: ['Yes/No の立場が分かる', '理由が2つある', '同じ内容を繰り返していない'],
    sourceInspiration: 'eiken-official-grade3-writing',
  },
  {
    id: 'grade3-opinion-school-uniform',
    level: 'grade-3',
    taskType: 'opinion',
    titleJa: '制服',
    promptEn: 'Do you like wearing a school uniform? Give your opinion and two reasons.',
    promptJa: '学校の制服を着ることは好きですか。自分の意見と理由を2つ書きましょう。',
    wordRange: { min: 25, max: 35 },
    focusPoints: ['好みの表現', '理由の具体化', '比較表現'],
    checklist: ['意見を最初に書いた', '理由が2つある', '文が短くてもつながっている'],
    sourceInspiration: 'eiken-official-grade3-writing',
  },
  {
    id: 'grade3-opinion-morning-study',
    level: 'grade-3',
    taskType: 'opinion',
    titleJa: '朝の勉強',
    promptEn: 'Is studying in the morning better than studying at night? Give your opinion and two reasons.',
    promptJa: '朝に勉強する方が夜よりよいと思いますか。自分の意見と理由を2つ書きましょう。',
    wordRange: { min: 25, max: 35 },
    focusPoints: ['比較の理由づけ', '生活習慣語彙', 'because の使用'],
    checklist: ['どちらがよいかを書いた', '理由が2つある', 'morning/night の比較がある'],
    sourceInspiration: 'eiken-official-grade3-writing',
  },
  {
    id: 'pre2-email-club-advice',
    level: 'pre-2',
    taskType: 'email',
    titleJa: '部活動の相談',
    promptEn: 'A student overseas asks how to choose a school club. Write a reply with advice. Answer the student\'s questions about time and friends, and ask one follow-up question.',
    promptJa: '海外の生徒に部活動の選び方を助言します。時間と友人に関する質問へ答え、追加で1つ質問しましょう。',
    wordRange: { min: 40, max: 50 },
    focusPoints: ['助言表現', '条件の整理', '返信の一貫性'],
    checklist: ['相手の質問に両方答えた', '助言が具体的である', '追加質問が自然である'],
    sourceInspiration: 'eiken-official-pre2-writing',
  },
  {
    id: 'pre2-email-local-event',
    level: 'pre-2',
    taskType: 'email',
    titleJa: '地域イベントへの招待',
    promptEn: 'Your friend wants to join a local event in Japan. Write an email explaining what people do there, what to bring, and one reason the event is enjoyable.',
    promptJa: '日本の地域イベントに参加したい友人へ、内容・持ち物・楽しい理由を説明する返信を書きましょう。',
    wordRange: { min: 40, max: 50 },
    focusPoints: ['説明順序', '必要な持ち物', '理由の補足'],
    checklist: ['イベント内容を書いた', '持ち物を書いた', '楽しい理由を説明した'],
    sourceInspiration: 'eiken-official-pre2-writing',
  },
  {
    id: 'pre2-email-study-app',
    level: 'pre-2',
    taskType: 'email',
    titleJa: '学習アプリの使い方',
    promptEn: 'An online friend asks how you use a study app. Write a reply. Explain when you use it, what feature is useful, and ask one question about your friend\'s study habits.',
    promptJa: 'オンラインの友人に学習アプリの使い方を説明します。使う時間、便利な機能を書き、相手の学習習慣を1つ質問しましょう。',
    wordRange: { min: 40, max: 50 },
    focusPoints: ['習慣の説明', '機能の説明', '相手への質問'],
    checklist: ['いつ使うかを書いた', '便利な機能を1つ説明した', '相手の勉強について質問した'],
    sourceInspiration: 'eiken-cbt-writing-format',
  },
  {
    id: 'pre2-opinion-school-tablets',
    level: 'pre-2',
    taskType: 'opinion',
    titleJa: '学校のタブレット',
    promptEn: 'Do you think all students should use tablets in class? Write your opinion with two reasons.',
    promptJa: 'すべての生徒が授業でタブレットを使うべきだと思いますか。意見と理由を2つ書きましょう。',
    wordRange: { min: 50, max: 60 },
    focusPoints: ['賛否の明示', '学習効果', '具体例'],
    checklist: ['意見が明確である', '理由が2つある', '授業場面に結びついている'],
    sourceInspiration: 'eiken-official-pre2-writing',
  },
  {
    id: 'pre2-opinion-part-time-jobs',
    level: 'pre-2',
    taskType: 'opinion',
    titleJa: '高校生のアルバイト',
    promptEn: 'Should high school students have part-time jobs? Write your opinion with two reasons.',
    promptJa: '高校生はアルバイトをするべきだと思いますか。意見と理由を2つ書きましょう。',
    wordRange: { min: 50, max: 60 },
    focusPoints: ['should の主張', '利点と注意点', '経験の例'],
    checklist: ['主張が一文目で分かる', '理由が2つある', 'money/time などの観点が具体的である'],
    sourceInspiration: 'eiken-official-pre2-writing',
  },
  {
    id: 'pre2-opinion-school-lunch',
    level: 'pre-2',
    taskType: 'opinion',
    titleJa: '給食と弁当',
    promptEn: 'Is school lunch better than bringing lunch from home? Write your opinion with two reasons.',
    promptJa: '給食は家から弁当を持ってくるよりよいと思いますか。意見と理由を2つ書きましょう。',
    wordRange: { min: 50, max: 60 },
    focusPoints: ['比較表現', '健康・費用の観点', '理由の展開'],
    checklist: ['比較の立場が明確である', '理由が2つある', '健康や費用など具体的な観点がある'],
    sourceInspiration: 'eiken-official-pre2-writing',
  },
  {
    id: 'pre2-summary-community-garden',
    level: 'pre-2',
    taskType: 'summary',
    titleJa: '地域の菜園',
    promptEn: 'Read a short passage about a community garden project. Summarize why local students joined it and what changed in the neighborhood.',
    promptJa: '地域の菜園プロジェクトについての短い英文を読み、学生が参加した理由と地域の変化を要約しましょう。',
    wordRange: { min: 45, max: 55 },
    focusPoints: ['理由の抽出', '変化の整理', '自分の意見を混ぜない'],
    checklist: ['参加理由を入れた', '地域の変化を入れた', '本文にない意見を足していない'],
    sourceInspiration: 'eiken-official-pre2-plus-summary',
  },
  {
    id: 'pre2-summary-library-cafe',
    level: 'pre-2',
    taskType: 'summary',
    titleJa: '図書館カフェ',
    promptEn: 'Read a short passage about a library cafe for teenagers. Summarize the problem the library had and how the new space helped.',
    promptJa: '中高生向けの図書館カフェについて読み、図書館の課題と新しい場所が役立った点を要約しましょう。',
    wordRange: { min: 45, max: 55 },
    focusPoints: ['課題と解決', '因果関係', '簡潔な言い換え'],
    checklist: ['最初の課題を書いた', '解決策を書いた', '同じ表現を長く写していない'],
    sourceInspiration: 'eiken-official-pre2-plus-summary',
  },
  {
    id: 'pre2-summary-bike-map',
    level: 'pre-2',
    taskType: 'summary',
    titleJa: '自転車マップ',
    promptEn: 'Read a short passage about students making a safe cycling map. Summarize what information they collected and how people used the map.',
    promptJa: '安全な自転車マップ作りについて読み、集めた情報と地図の使われ方を要約しましょう。',
    wordRange: { min: 45, max: 55 },
    focusPoints: ['情報の取捨選択', '結果の説明', '過去形'],
    checklist: ['集めた情報を書いた', '利用された結果を書いた', '細部を入れすぎていない'],
    sourceInspiration: 'eiken-official-pre2-plus-summary',
  },
  {
    id: 'grade2-opinion-remote-work',
    level: 'grade-2',
    taskType: 'opinion',
    titleJa: 'リモートワーク',
    promptEn: 'Some people say remote work should become more common. Do you agree with this opinion? Write your answer with reasons and examples.',
    promptJa: 'リモートワークはもっと一般的になるべきだという意見に賛成ですか。理由と例を挙げて書きましょう。',
    wordRange: { min: 80, max: 100 },
    focusPoints: ['立場の一貫性', '社会的観点', '例による補強'],
    checklist: ['賛否を明確にした', '理由を2つ以上展開した', '仕事や生活への影響を具体化した'],
    sourceInspiration: 'eiken-official-grade2-writing',
  },
  {
    id: 'grade2-opinion-food-waste',
    level: 'grade-2',
    taskType: 'opinion',
    titleJa: '食品ロス',
    promptEn: 'Do you think schools should do more to reduce food waste? Write your opinion with reasons and examples.',
    promptJa: '学校は食品ロスを減らすためにもっと取り組むべきだと思いますか。理由と例を挙げて書きましょう。',
    wordRange: { min: 80, max: 100 },
    focusPoints: ['環境問題', '学校でできる対策', '具体例'],
    checklist: ['学校の役割に触れた', '理由を2つ以上書いた', '対策や例が現実的である'],
    sourceInspiration: 'eiken-official-grade2-writing',
  },
  {
    id: 'grade2-opinion-online-news',
    level: 'grade-2',
    taskType: 'opinion',
    titleJa: 'オンラインニュース',
    promptEn: 'Is online news a better source of information than television news? Write your opinion with reasons and examples.',
    promptJa: 'オンラインニュースはテレビニュースよりよい情報源だと思いますか。理由と例を挙げて書きましょう。',
    wordRange: { min: 80, max: 100 },
    focusPoints: ['比較論述', '信頼性', '利便性'],
    checklist: ['比較対象が明確である', '利点または欠点を具体化した', '情報の信頼性に触れた'],
    sourceInspiration: 'eiken-official-grade2-writing',
  },
  {
    id: 'grade2-opinion-tourism-fees',
    level: 'grade-2',
    taskType: 'opinion',
    titleJa: '観光地の入場料',
    promptEn: 'Should popular tourist sites charge higher entrance fees to protect the environment? Write your opinion with reasons and examples.',
    promptJa: '人気の観光地は環境保護のために入場料を高くするべきだと思いますか。理由と例を挙げて書きましょう。',
    wordRange: { min: 80, max: 100 },
    focusPoints: ['環境と経済の両面', '反論への配慮', '具体例'],
    checklist: ['環境保護との関係を書いた', '観光客や地域への影響に触れた', '結論が一貫している'],
    sourceInspiration: 'eiken-official-grade2-writing',
  },
  {
    id: 'grade2-summary-after-school-meals',
    level: 'grade-2',
    taskType: 'summary',
    titleJa: '放課後の食事支援',
    promptEn: 'Read a passage about an after-school meal program. Summarize the problem it addresses, how volunteers support it, and one result of the program.',
    promptJa: '放課後の食事支援について読み、解決する課題、ボランティアの支援、結果を要約しましょう。',
    wordRange: { min: 55, max: 65 },
    focusPoints: ['問題・方法・結果', '要点の圧縮', '客観的な文体'],
    checklist: ['課題を書いた', '支援方法を書いた', '結果を1つ入れた'],
    sourceInspiration: 'eiken-official-grade2-summary',
  },
  {
    id: 'grade2-summary-repair-cafe',
    level: 'grade-2',
    taskType: 'summary',
    titleJa: '修理カフェ',
    promptEn: 'Read a passage about a repair cafe. Summarize why it was started, what visitors learn, and how it may affect waste.',
    promptJa: '修理カフェについて読み、始まった理由、来場者が学ぶこと、廃棄物への影響を要約しましょう。',
    wordRange: { min: 55, max: 65 },
    focusPoints: ['目的の整理', '学びの内容', '環境への影響'],
    checklist: ['開始理由を書いた', '来場者の学びを書いた', '廃棄物への影響に触れた'],
    sourceInspiration: 'eiken-official-grade2-summary',
  },
  {
    id: 'grade2-summary-digital-tickets',
    level: 'grade-2',
    taskType: 'summary',
    titleJa: 'デジタルチケット',
    promptEn: 'Read a passage about digital tickets for public events. Summarize the benefits, a concern for some users, and how organizers responded.',
    promptJa: 'イベントのデジタルチケットについて読み、利点、一部利用者の不安、主催者の対応を要約しましょう。',
    wordRange: { min: 55, max: 65 },
    focusPoints: ['利点と懸念', '対応策', '対比の表現'],
    checklist: ['利点を書いた', '懸念点を書いた', '対応策を書いた'],
    sourceInspiration: 'eiken-official-grade2-summary',
  },
  {
    id: 'grade2-summary-school-solar',
    level: 'grade-2',
    taskType: 'summary',
    titleJa: '学校の太陽光発電',
    promptEn: 'Read a passage about a school installing solar panels. Summarize the reason for the project, the challenge during installation, and the educational benefit.',
    promptJa: '学校の太陽光発電導入について読み、導入理由、設置時の課題、教育上の利点を要約しましょう。',
    wordRange: { min: 55, max: 65 },
    focusPoints: ['理由・課題・利点', '情報の優先順位', '過不足のない要約'],
    checklist: ['導入理由を書いた', '課題を書いた', '教育上の利点を書いた'],
    sourceInspiration: 'eiken-official-grade2-summary',
  },
  {
    id: 'pre1-opinion-ai-health-advice',
    level: 'pre-1',
    taskType: 'opinion',
    titleJa: 'AIによる健康助言',
    promptEn: 'Should public institutions use AI systems to provide basic health advice? Write an essay with reasons and supporting examples.',
    promptJa: '公的機関は基本的な健康助言にAIを使うべきでしょうか。理由と具体例を挙げて論じましょう。',
    wordRange: { min: 120, max: 150 },
    focusPoints: ['公共性', '安全性と利便性', '反論処理'],
    checklist: ['公共機関が使う意味を論じた', '利点とリスクを整理した', '結論が本文と対応している'],
    sourceInspiration: 'eiken-official-pre1-writing',
  },
  {
    id: 'pre1-opinion-four-day-week',
    level: 'pre-1',
    taskType: 'opinion',
    titleJa: '週4日勤務',
    promptEn: 'Would a four-day workweek benefit society as a whole? Write an essay with reasons and supporting examples.',
    promptJa: '週4日勤務は社会全体に利益をもたらすでしょうか。理由と具体例を挙げて論じましょう。',
    wordRange: { min: 120, max: 150 },
    focusPoints: ['労働生産性', '生活の質', '経済的影響'],
    checklist: ['社会全体への影響を論じた', '複数の観点がある', '例が抽象論だけで終わっていない'],
    sourceInspiration: 'eiken-official-pre1-writing',
  },
  {
    id: 'pre1-opinion-urban-farming',
    level: 'pre-1',
    taskType: 'opinion',
    titleJa: '都市農業',
    promptEn: 'Can urban farming play an important role in future cities? Write an essay with reasons and supporting examples.',
    promptJa: '都市農業は将来の都市で重要な役割を果たせるでしょうか。理由と具体例を挙げて論じましょう。',
    wordRange: { min: 120, max: 150 },
    focusPoints: ['食料供給', '環境教育', '都市計画'],
    checklist: ['将来の都市との関係を書いた', '利点または限界を具体化した', '段落ごとの役割が明確である'],
    sourceInspiration: 'eiken-official-pre1-writing',
  },
  {
    id: 'pre1-opinion-digital-currency',
    level: 'pre-1',
    taskType: 'opinion',
    titleJa: 'デジタル通貨',
    promptEn: 'Should governments encourage the use of digital currency instead of cash? Write an essay with reasons and supporting examples.',
    promptJa: '政府は現金の代わりにデジタル通貨の利用を促進すべきでしょうか。理由と具体例を挙げて論じましょう。',
    wordRange: { min: 120, max: 150 },
    focusPoints: ['利便性', 'プライバシー', '金融包摂'],
    checklist: ['政府が促進する是非を明確にした', '社会的リスクに触れた', '結論で主張を再確認した'],
    sourceInspiration: 'eiken-official-pre1-writing',
  },
  {
    id: 'pre1-summary-water-sharing',
    level: 'pre-1',
    taskType: 'summary',
    titleJa: '水資源の共有',
    promptEn: 'Read a passage about cities sharing water resources during droughts. Summarize the reason for cooperation, the main difficulty, and the long-term policy lesson.',
    promptJa: '干ばつ時の水資源共有について読み、協力の理由、主な困難、長期的な政策上の教訓を要約しましょう。',
    wordRange: { min: 70, max: 90 },
    focusPoints: ['政策課題', '困難の抽出', '長期的示唆'],
    checklist: ['協力の理由を書いた', '困難を具体的に書いた', '政策上の教訓を入れた'],
    sourceInspiration: 'eiken-official-pre1-summary',
  },
  {
    id: 'pre1-summary-battery-recycling',
    level: 'pre-1',
    taskType: 'summary',
    titleJa: 'バッテリーのリサイクル',
    promptEn: 'Read a passage about battery recycling. Summarize why demand is increasing, what technical obstacle remains, and how companies are responding.',
    promptJa: 'バッテリーリサイクルについて読み、需要増加の理由、残る技術的課題、企業の対応を要約しましょう。',
    wordRange: { min: 70, max: 90 },
    focusPoints: ['需要と課題', '企業対応', '専門語の言い換え'],
    checklist: ['需要増加の理由を書いた', '技術的課題を書いた', '企業の対応を書いた'],
    sourceInspiration: 'eiken-official-pre1-summary',
  },
  {
    id: 'pre1-summary-rural-telemedicine',
    level: 'pre-1',
    taskType: 'summary',
    titleJa: '地方の遠隔医療',
    promptEn: 'Read a passage about telemedicine in rural areas. Summarize the access problem, the benefits for patients, and the concern doctors still have.',
    promptJa: '地方の遠隔医療について読み、医療アクセスの課題、患者への利点、医師側に残る懸念を要約しましょう。',
    wordRange: { min: 70, max: 90 },
    focusPoints: ['課題と利点の対比', '医療語彙', '客観要約'],
    checklist: ['アクセスの課題を書いた', '患者への利点を書いた', '医師側の懸念を書いた'],
    sourceInspiration: 'eiken-official-pre1-summary',
  },
  {
    id: 'pre1-summary-coastal-restoration',
    level: 'pre-1',
    taskType: 'summary',
    titleJa: '沿岸部の再生',
    promptEn: 'Read a passage about restoring coastal wetlands. Summarize the environmental goal, the conflict with local development, and the compromise plan.',
    promptJa: '沿岸湿地の再生について読み、環境面の目的、地域開発との対立、妥協案を要約しましょう。',
    wordRange: { min: 70, max: 90 },
    focusPoints: ['目的・対立・妥協', '因果関係', '中立的表現'],
    checklist: ['環境面の目的を書いた', '地域開発との対立を書いた', '妥協案を書いた'],
    sourceInspiration: 'eiken-official-pre1-summary',
  },
];

export const getEikenWritingTasks = (
  options: GetEikenWritingTasksOptions = {},
): EikenWritingTask[] => {
  const tasks = EIKEN_WRITING_TASKS.filter((task) => (
    (!options.level || task.level === options.level)
    && (!options.taskType || task.taskType === options.taskType)
  ));
  const maxTasks = options.maxTasks === undefined ? tasks.length : Math.max(0, options.maxTasks);

  return tasks.slice(0, maxTasks);
};

export const getDefaultEikenWritingTask = (
  options: Omit<GetEikenWritingTasksOptions, 'maxTasks'> = {},
): EikenWritingTask | null => getEikenWritingTasks({ ...options, maxTasks: 1 })[0] ?? null;

export const countEssayWords = (essay: string): number => (
  essay.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)?.length ?? 0
);

export const getEikenWritingLevelLabel = (level: EikenWritingLevel): string => (
  EIKEN_WRITING_LEVEL_LABELS[level]
);

export const getEikenWritingTaskTypeLabel = (taskType: EikenWritingTaskType): string => (
  EIKEN_WRITING_TASK_TYPE_LABELS[taskType]
);
