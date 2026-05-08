export const BRAND = {
  officialName: 'Steady Study',
  shortName: 'Steady Study',
  productLabel: '英単語学習スペース',
  supportLabel: 'Steady Study の英語学習アプリ',
  title: 'Steady Study | 英単語学習スペース',
  mark: 'SS',
  footerLabel: 'Steady Study',
} as const;

export const BRAND_VISUAL_SYSTEM = {
  palette: {
    primary: {
      50: '#fff8f1',
      100: '#ffe9d1',
      200: '#ffd1a3',
      300: '#ffb874',
      400: '#ff9a3c',
      500: '#ff8216',
      600: '#ef6f00',
      700: '#c85a00',
      800: '#944300',
      900: '#5f2b00',
      950: '#3a1800',
    },
    neutral: {
      ink: '#111827',
      muted: '#475569',
      canvas: '#fffaf5',
      panel: '#ffffff',
      line: '#ebdecc',
    },
    signal: {
      amber: '#d97706',
      coral: '#dc2626',
      blue: '#2563eb',
    },
  },
  radius: {
    card: '12px',
    panel: '16px',
    control: '12px',
    pill: '9999px',
  },
  mockAssets: {
    root: 'docs/assets/ui-mocks',
    naming: 'YYYY-MM-DD_surface_viewport_variant.png',
  },
  principles: [
    'B2B workspace first: dense, calm, scannable screens over marketing decoration.',
    'Use orange as the product anchor, with green, red, and blue reserved for status meaning.',
    'Keep cards restrained; reserve pill shapes for chips, badges, and compact controls.',
    'Mobile screens must fit 320px width without horizontal scroll or overlapping text.',
  ],
} as const;

export const AUTH_COPY = {
  eyebrow: 'Steady Study',
  title: ['英単語学習を', '今日から迷わず', '続けられる場所'],
  body: '初回診断で今のスタート帯を確認し、今日やるべき復習と教材をすぐ始められます。学習履歴と復習タイミングはアプリが整えます。',
  loginSteps: [
    '登録済みならメールアドレスとパスワードですぐ再開',
    '初めてなら右の「新規登録」から1分で開始',
    'まず試したい場合は体験用アカウントで確認',
  ],
  signupSteps: [
    '1. 表示名・メールアドレス・パスワードを入力',
    '2. 登録後、そのまま初回診断へ進む',
    '3. 今日の復習とおすすめ教材が自動で整う',
  ],
  demoEyebrow: '体験用アカウント',
  demoBody: '登録前でも、生徒画面と講師画面の導線をそのまま確認できます。',
  loginHeading: '学習を再開する',
  loginBody: '登録済みのメールアドレスでログインすると、前回の学習状況からすぐ再開できます。',
  signupHeading: '1分で学習を始める',
  signupBody: '登録後はすぐにレベル診断へ進みます。表示名はランキングやプロフィールに表示されます。',
  helperLogin: '初めて利用する場合は「新規登録」に切り替えて、表示名・メールアドレス・パスワードを入力してください。',
  helperSignup: '登録後は自動でログインし、初回レベル診断とプロフィール設定に進みます。',
} as const;
