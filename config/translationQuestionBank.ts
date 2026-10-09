import { EnglishLevel, type GrammarCurriculumScopeId } from '../types';

export type TranslationMeaningError =
  | 'NEGATION' | 'PARTICIPANT' | 'COMPARISON' | 'TIME_OR_NUMBER'
  | 'VOICE' | 'MODALITY' | 'CLAUSE_RELATION';

export interface ReviewedTranslationError {
  text: string;
  errorType: TranslationMeaningError;
  reasonJa: string;
}

/** Independently authored material. Meaning elements explain review; they are not regex grading rules. */
export interface OriginalTranslationQuestion {
  id: string;
  version: number;
  scopeId: GrammarCurriculumScopeId;
  level: EnglishLevel;
  contextJa: string;
  sourceSentence: string;
  referenceTranslation: string;
  acceptedTranslations: readonly string[];
  requiredMeaningElements: readonly string[];
  knownIncorrectTranslations: readonly ReviewedTranslationError[];
  explanationJa: string;
  orderChunks: readonly string[];
  alternateOrders: readonly (readonly number[])[];
  vocabularyNotesJa?: readonly string[];
  provenance: {
    kind: 'ORIGINAL';
    authoredAt: string;
    authoringMethodJa: string;
    reviewMethodJa: string;
  };
}

const { A1, A2, B1, B2 } = EnglishLevel;
const provenance: OriginalTranslationQuestion['provenance'] = {
  kind: 'ORIGINAL',
  authoredAt: '2026-10-09',
  authoringMethodJa: '和訳練習用に英文・日本語訳・誤訳例を独立著作。教材の原文、単語帳の語義、AI回答からの転用なし。',
  reviewMethodJa: '作業内で主客・否定・比較・時点・数量・態を相互照合し、許容訳と誤訳をgoldenテストに固定。教員による外部監修は未実施。',
};

// Explicitly reviewed whole-sentence variants, not a rule that arbitrary swaps are correct.
const alternateOrdersByKey: Record<string, readonly (readonly number[])[]> = {
  'svo-01': [[1, 0, 2, 3], [0, 2, 1, 3]],
  'be-negation-01': [[1, 0, 2]],
  'past-number-01': [[1, 0, 2, 3, 4]],
  'clock-time-01': [[1, 0, 2]],
  'ability-01': [[1, 0, 2, 3], [0, 2, 1, 3]],
  'comparison-01': [[1, 0, 2]],
  'passive-agent-01': [[1, 0, 2, 3], [0, 2, 1, 3]],
  'purpose-01': [[1, 2, 0, 3, 4]],
  'progressive-now-01': [[1, 0, 2, 3], [0, 2, 1, 3]],
  'perfect-duration-01': [[0, 2, 1, 3]],
  'conditional-rain-01': [[2, 0, 1, 3, 4]],
  'relative-recipient-01': [[1, 0, 2, 3]],
  'when-background-01': [[1, 0, 2, 3]],
  'counterfactual-past-01': [[2, 0, 1, 3, 4]],
  'partial-negation-01': [[1, 0, 2, 3]],
  'passive-before-01': [[1, 0, 2, 3]],
};

const question = (
  key: string,
  scopeId: GrammarCurriculumScopeId,
  level: EnglishLevel,
  contextJa: string,
  sourceSentence: string,
  chunks: string,
  acceptedTranslations: readonly string[],
  requiredMeaningElements: readonly string[],
  knownIncorrectTranslations: readonly ReviewedTranslationError[],
  explanationJa: string,
  vocabularyNotesJa: readonly string[] = [],
): OriginalTranslationQuestion => {
  const orderChunks = chunks.split('|');
  return {
    id: `translation-original-20261009-${key}`,
    version: 2,
    scopeId,
    level,
    contextJa,
    sourceSentence,
    referenceTranslation: orderChunks.join(''),
    acceptedTranslations,
    requiredMeaningElements,
    knownIncorrectTranslations,
    explanationJa,
    orderChunks,
    alternateOrders: alternateOrdersByKey[key] ?? [],
    ...(vocabularyNotesJa.length > 0 ? { vocabularyNotesJa } : {}),
    provenance,
  };
};

export const ORIGINAL_TRANSLATION_QUESTIONS: readonly OriginalTranslationQuestion[] = [
  question('svo-01', 'basic-svo', A1,
    '生徒たちが毎朝行う、部屋の掃除についての文です。',
    'The students clean the room every morning.',
    '生徒たちは|毎朝|部屋を|掃除します。',
    ['生徒たちは毎朝、部屋を掃除する。', '毎朝、生徒たちが部屋を掃除します。'],
    ['掃除する人は生徒たち', '掃除の対象は部屋', '毎朝の習慣'],
    [{ text: '部屋が毎朝生徒たちを掃除します。', errorType: 'PARTICIPANT', reasonJa: '主語 The students が掃除する人、目的語 the room が掃除の対象です。主語と目的語が逆になっています。' }],
    'The students / clean / the room が主語・動詞・目的語です。every morning は掃除の頻度を表し、現在形はこの毎朝の習慣を伝えます。'),
  question('be-negation-01', 'be-verb', A1,
    '今日の自分の状態を伝える文です。',
    'I am not busy today.',
    '私は|今日は|忙しくありません。',
    ['今日は私は忙しくない。', '私は今日、忙しくないです。'],
    ['話している本人の状態', '忙しいことを否定', '今日の状態'],
    [{ text: '私は今日は忙しいです。', errorType: 'NEGATION', reasonJa: 'not が busy を否定しています。「忙しい」では否定が落ちて、英文と反対の状態になります。' }],
    'am not busy は「忙しくない」という状態です。today は今日という時点を限定しています。日本語の語順や丁寧さは変えても、否定と時点を残します。'),
  question('past-number-01', 'basic-tense', A1,
    '昨日、サラが実際に書いたものとその数を伝えます。',
    'Sara wrote two letters yesterday.',
    'サラは|昨日|手紙を|2通|書きました。',
    ['サラは昨日、2通の手紙を書いた。', '昨日サラが手紙を二通書きました。'],
    ['書いた人はサラ', '手紙は2通', '昨日の完了した出来事'],
    [
      { text: 'サラは明日手紙を2通書きます。', errorType: 'TIME_OR_NUMBER', reasonJa: 'wrote は過去形で、yesterday は「昨日」です。明日の予定にはなりません。' },
      { text: 'サラは昨日手紙を1通書きました。', errorType: 'TIME_OR_NUMBER', reasonJa: 'two letters は手紙2通です。数を1通に変えると英文の情報が変わります。' },
    ],
    'wrote は write の過去形です。two が手紙の数、yesterday が出来事の時点を示します。主語・動作に加え、数と過去の時点を訳に残します。'),
  question('clock-time-01', 'time-preposition-phrase', A1,
    '図書館が開く時計の時刻を案内します。',
    'The library opens at ten.',
    '図書館は|10時に|開きます。',
    ['図書館は十時に開く。', '10時に図書館が開きます。'],
    ['開く場所は図書館', '開く時刻は10時'],
    [{ text: '図書館は10時間開いています。', errorType: 'TIME_OR_NUMBER', reasonJa: 'at ten は開く「時刻」が10時という意味です。10時間という継続時間ではありません。' }],
    'at + 時計の時刻で「何時に」を表します。opens は開く時点を伝えています。for ten hours のような長さと区別して、10時という時刻を訳します。'),
  question('ability-01', 'modal-base-verb', A1,
    '補助を受けずに本を読める能力についての文です。',
    'Mika can read this book without help.',
    'ミカは|助けなしで|この本を|読めます。',
    ['ミカはこの本を一人で読むことができます。', 'ミカは誰の助けも借りずにこの本を読める。'],
    ['読む人はミカ', '対象はこの本', '読む能力がある', '助けを必要としない'],
    [{ text: 'ミカは助けがなければこの本を読めません。', errorType: 'NEGATION', reasonJa: 'can read ... without help は助けなしで「読める」です。「読めない」では能力の意味が逆になります。' }],
    'can read は読めるという能力を表します。without help は助けを受けない条件です。「一人で読める」もこの文脈では同じ内容を伝えます。',
    ['without help：助けなしで']),

  question('comparison-01', 'comparative', A2,
    '目の前の箱と、離れた場所の箱の重さを比べます。',
    'This box is lighter than that box.',
    'この箱は|あの箱より|軽いです。',
    ['この箱はあの箱よりも軽い。', 'あの箱と比べると、この箱の方が軽いです。'],
    ['比較する対象はこの箱とあの箱', '軽いのはこの箱'],
    [{ text: 'あの箱はこの箱より軽いです。', errorType: 'COMPARISON', reasonJa: 'lighter の主語は This box です。「この箱」の方が軽く、比較の方向を逆にできません。' }],
    'This box が比較級 lighter の主語です。than that box は比較の相手を示します。「どちらが軽いか」を先に確かめて、比較の方向を訳します。'),
  question('prohibition-01', 'modal-base-verb', A2,
    'この部屋への立ち入りを禁止する掲示です。',
    'You must not enter this room.',
    'この部屋に|入っては|いけません。',
    ['この部屋には入ってはいけない。', 'この部屋への立ち入りは禁止です。'],
    ['行為はこの部屋に入ること', 'その行為は禁止'],
    [{ text: 'この部屋に入る必要はありません。', errorType: 'MODALITY', reasonJa: 'must not は「してはいけない」という禁止です。「する必要がない」は do not have to の意味で、禁止とは異なります。' }],
    'must not + 動詞は強い禁止を表します。必要がないことを表す do not have to と区別します。この文では入室そのものが禁じられています。'),
  question('passive-agent-01', 'passive-voice', A2,
    '昨日割れた窓について、誰が割ったかを説明します。',
    'The window was broken by Ken yesterday.',
    'その窓は|昨日|ケンによって|割られました。',
    ['昨日、ケンがその窓を割った。', '昨日その窓を割ったのはケンです。'],
    ['割られた物はその窓', '割った人はケン', '昨日の出来事'],
    [{ text: 'ケンは昨日その窓によって割られました。', errorType: 'VOICE', reasonJa: '受け身の主語 The window は割られた物です。by Ken は割った人を示しており、行為者と対象を逆にできません。' }],
    'was broken は「割られた」、by Ken はその行為をした人です。日本語では「ケンが窓を割った」という能動の訳でも同じ出来事を伝えられます。yesterday の時点も残します。'),
  question('purpose-01', 'to-infinitive', A2,
    '新しい靴を買うことを目的として、お金をためた話です。',
    'I saved money to buy new shoes.',
    '私は|新しい靴を|買うために|お金を|ためました。',
    ['私は新しい靴を買うため、お金を貯めた。', '新しい靴を買うために、私はお金を貯めました。'],
    ['お金をためた人は私', 'ためた目的は新しい靴を買うこと', 'ためたのは過去'],
    [{ text: '私は新しい靴を買ってからお金をためました。', errorType: 'CLAUSE_RELATION', reasonJa: 'to buy はお金をためる「目的」です。靴を買った後という出来事の順序は述べていません。' }],
    'to buy new shoes は saved money の目的を説明する不定詞です。英文は靴を実際に買ったとは断定していません。「買うために」と目的の関係を訳します。'),
  question('progressive-now-01', 'progressive-aspect', A2,
    '今まさに公園で遊んでいる子どもたちを説明します。',
    'The children are playing in the park now.',
    '子どもたちは|今|公園で|遊んでいます。',
    ['今、子どもたちが公園で遊んでいる。', '子供たちは今公園で遊んでいます。'],
    ['遊んでいる人は子どもたち', '場所は公園', '今進行中の動作'],
    [{ text: '子どもたちは昨日公園で遊びました。', errorType: 'TIME_OR_NUMBER', reasonJa: 'are playing と now は今進行中の動作です。昨日の終わった出来事にはなりません。' }],
    'are playing は進行形で「遊んでいる」、now は現在の時点です。in the park の場所を保ち、過去の出来事や一般的な習慣に変えずに訳します。'),

  question('perfect-duration-01', 'present-perfect', B1,
    '3年前に住み始め、今も住んでいる場所について話します。',
    'We have lived in this town for three years.',
    '私たちは|この町に|3年間|住んでいます。',
    ['私たちはこの町に三年間住み続けています。', '私たちがこの町に住むようになって3年になります。'],
    ['住んでいる人は私たち', '場所はこの町', '継続期間は3年', '今も継続している'],
    [{ text: '私たちは3年前までこの町に住んでいました。', errorType: 'TIME_OR_NUMBER', reasonJa: 'have lived ... for three years は今に続く3年間の居住です。「3年前まで」では期間と現在への継続の両方が変わります。' }],
    '現在完了 have lived と for three years は、過去から現在まで続く居住を表します。for は期間の長さです。「3年前まで」と終了した時点に変えないようにします。'),
  question('conditional-rain-01', 'first-conditional', B1,
    '明日の天気を条件として、私たちの予定を話します。',
    'If it rains tomorrow, we will stay home.',
    'もし明日|雨が降ったら、|私たちは|家に|います。',
    ['明日雨が降れば、私たちは家にいるつもりです。', '明日雨なら、私たちは家にとどまります。'],
    ['条件は明日雨が降ること', 'その条件で私たちは家にいる', '雨が降るとは断定していない'],
    [{ text: '明日は雨が降るので、私たちは家にいます。', errorType: 'CLAUSE_RELATION', reasonJa: 'If は未確定の条件を表します。「雨が降るので」と確定した理由に変えると、明日の天気を断定してしまいます。' }],
    'If 節は条件であり、明日雨が降ると断定する文ではありません。主節の will stay home はその条件の下での予定です。条件と結果の関係を訳します。'),
  question('relative-recipient-01', 'relative-clause', B1,
    '先週、私があなたに貸した本について感想を述べます。',
    'The book that I lent you last week is interesting.',
    '私が|先週あなたに|貸した本は|おもしろいです。',
    ['先週私があなたに貸した本は面白い。', '私が先週あなたに貸した本は面白いです。'],
    ['貸した人は私', '借りた相手はあなた', '貸したのは先週', 'その本はおもしろい'],
    [{ text: 'あなたが先週私に貸した本はおもしろいです。', errorType: 'PARTICIPANT', reasonJa: 'I lent you は「私があなたに貸した」です。貸した人と受け取った相手が逆になっています。' }],
    'that I lent you last week が The book を説明します。lent の主語 I は貸した人、you は貸した相手です。主節 is interesting は本の性質を述べています。'),
  question('gerund-suggestion-01', 'gerund', B1,
    '会議中に、ナオが短く休むことを提案しました。',
    'Nao suggested taking a short break.',
    'ナオは|短い休憩を|取ることを|提案しました。',
    ['ナオは少し休憩することを提案した。', 'ナオは短い休憩を取ろうと提案しました。'],
    ['提案した人はナオ', '提案内容は短い休憩を取ること', '実際に休んだとは断定しない'],
    [{ text: 'ナオは短い休憩を取りました。', errorType: 'CLAUSE_RELATION', reasonJa: 'suggested は「提案した」です。休憩したという実行の事実ではなく、taking a short break が提案の内容です。' }],
    'taking a short break は suggested の目的語となる動名詞のまとまりです。英文で確認できるのは提案したことまでで、実際に休憩を取ったとは断定できません。'),
  question('when-background-01', 'when-while-clause', B1,
    '電話が鳴った時点で、ユウは夕食を作っている途中でした。',
    'Yuu was cooking dinner when the phone rang.',
    '電話が鳴ったとき、|ユウは|夕食を|作っていました。',
    ['電話が鳴ったとき、ユウは夕食を作っているところでした。', 'ユウが夕食を作っていると、電話が鳴った。'],
    ['料理をしていた人はユウ', '作っていたのは夕食', '料理中に電話が鳴った'],
    [{ text: '電話が鳴った後で、ユウは夕食を作り始めました。', errorType: 'TIME_OR_NUMBER', reasonJa: 'was cooking は電話が鳴った時に既に進行中だった料理です。電話の後で作り始めたという順序にはなりません。' }],
    'was cooking が背景の進行中の動作、rang がその途中で起きた出来事です。when 節を先に訳しても、料理と電話の時間関係を保ちます。'),

  question('counterfactual-past-01', 'subjunctive-mood', B2,
    '昨日、地図を持たず道に迷った出来事を振り返ります。',
    'If I had taken a map, I would not have got lost.',
    'もし地図を|持っていっていたら、|私は|道に迷わずに|済んだでしょう。',
    ['地図を持っていっていれば、私は道に迷わなかっただろう。', 'もし私が地図を持っていっていたら、道に迷うことはなかったでしょう。'],
    ['過去の事実と異なる仮定', '仮定は地図を持っていったこと', 'その仮定なら道に迷わなかった'],
    [{ text: '私は地図を持っていったので、道に迷いませんでした。', errorType: 'CLAUSE_RELATION', reasonJa: 'If ... had taken と would not have got lost は過去に実現しなかった仮定です。地図を持っていった事実や、迷わなかった事実にはできません。' }],
    'If + had + 過去分詞と would have + 過去分詞は過去の反実仮想を表します。not は仮定の結果 got lost を否定します。事実の報告に変えず、仮定の形を残します。'),
  question('partial-negation-01', 'negation-emphasis', B2,
    '賛成しなかった生徒がいたことを、全員についての文で説明します。',
    'Not all the students agreed with the proposal.',
    'すべての生徒が|その提案に|賛成したわけでは|ありません。',
    ['生徒全員がその提案に賛成したわけではない。', 'その提案には、賛成しなかった生徒もいました。'],
    ['対象はその生徒たち', '対象となる意見はその提案', '全員の賛成を否定', '全員の不賛成とは断定しない'],
    [{ text: 'すべての生徒がその提案に反対しました。', errorType: 'NEGATION', reasonJa: 'Not all は「全員が〜したわけではない」という部分否定です。全員が反対したことまでは述べていません。' }],
    'Not all は全員についての賛成を否定します。None of the students agreed のような全否定とは異なります。「賛成しない生徒もいた」は言えますが、全員が反対したとは断定できません。'),
  question('reported-time-01', 'reported-speech', B2,
    '月曜日に「翌日戻る」と述べたリナの発言を、後から伝えます。',
    'Rina said that she would return the following day.',
    'リナは|その翌日に|戻ると|言いました。',
    ['リナは翌日戻ると言った。', 'リナは、次の日に戻るつもりだと話しました。'],
    ['発言した人はリナ', '戻る人もリナ', '戻る予定の時点は発言した日の翌日', '実際に戻ったとは断定しない'],
    [{ text: 'リナは戻った翌日にそう言いました。', errorType: 'TIME_OR_NUMBER', reasonJa: 'the following day は戻る予定の日です。発言した時点の翌日を指し、発言自体が戻った翌日という意味ではありません。' }],
    'said が発言を過去として伝え、would return がその時点から見た未来を表します。the following day は発言した日の翌日です。予定したことと実際の帰還は区別します。'),
  question('relative-extra-01', 'relative-clause', B2,
    '兄は一人です。その兄について、住む場所を補足しながら仕事を紹介します。',
    'My brother, who lives in Kyoto, teaches mathematics.',
    '私の兄は|京都に|住んでいて、|数学を|教えています。',
    ['私の兄は京都に住んでおり、数学を教えている。', '私の兄は京都在住で、数学を教えています。'],
    ['紹介している人は私の兄', '兄は京都に住んでいる', '兄の仕事は数学を教えること'],
    [{ text: '私の兄は京都に住んでいて、数学を教わっています。', errorType: 'PARTICIPANT', reasonJa: 'teaches は兄が数学を「教える」ことです。教わる立場に変えると、動作をする側が変わります。' }],
    'コンマで区切られた who lives in Kyoto は、兄を選び分ける条件ではなく補足説明です。主節は My brother teaches mathematics で、兄が数学を教える仕事をしていると伝えます。'),
  question('passive-before-01', 'passive-voice', B2,
    '嵐が始まる前に、橋の修理は既に完了していました。',
    'The bridge had been repaired before the storm began.',
    '嵐が始まる前に、|その橋は|修理されて|いました。',
    ['その橋は嵐が始まる前に修理済みだった。', '嵐が始まるより前に、その橋の修理は終わっていました。'],
    ['修理された物はその橋', '修理は嵐が始まる前に完了', '修理した人は特定されていない'],
    [{ text: '嵐が始まった後に、その橋は修理されました。', errorType: 'TIME_OR_NUMBER', reasonJa: 'before the storm began は嵐の前です。had been repaired はそれ以前に修理が済んだ受け身の過去完了で、嵐の後ではありません。' }],
    'had been repaired は過去完了の受け身です。嵐が始まった過去の時点よりも前に橋の修理が完了しています。by 句はないので、修理した人を補って断定しません。'),
];
