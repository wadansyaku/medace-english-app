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
      50: '#FDF3ED',
      100: '#FCE3D1',
      200: '#F9C6A1',
      300: '#FFBF52',
      400: '#F8974B',
      500: '#F66D0B',
      600: '#E85D00',
      700: '#9D3E05',
      800: '#7D340C',
      900: '#66321A',
      950: '#2F1609',
    },
    mark: '#F66D0B',
    accent: '#FFBF52',
    neutral: {
      ink: '#2F1609',
      muted: '#66321A',
      canvas: '#FDF3ED',
      panel: '#ffffff',
      line: '#e2e8f0',
    },
    action: {
      background: '#F66D0B',
      hover: '#E85D00',
      foreground: '#2F1609',
    },
    signal: {
      amber: '#f3b80a',
      coral: '#e02323',
      blue: '#2563eb',
    },
  },
  radius: {
    card: '20px',
    panel: '24px',
    control: '14px',
    pill: '9999px',
  },
  mockAssets: {
    root: 'docs/assets/ui-mocks',
    naming: 'YYYY-MM-DD_surface_viewport_variant.png',
  },
  principles: [
    'B2B workspace first: dense, calm, scannable screens over marketing decoration.',
    'Use MedAse official orange #F66D0B, a cream canvas, white panels, and dark brown text with accessible contrast.',
    'Avoid orange gradients, purple-tinted canvases, blue dominance, and gradient-heavy surfaces in learner-facing home screens.',
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
    '初めてなら登録なしの体験で教材ホームから始められる',
    'パスワードを忘れても再設定リクエストで止まらない',
  ],
  signupSteps: [
    '1. 表示名・メールアドレス・パスワードを入力',
    '2. 登録後、そのまま初回診断へ進む',
    '3. 今日の復習とおすすめ教材が自動で整う',
  ],
  demoEyebrow: '体験用アカウント',
  demoBody: '登録前でも、生徒画面と講師画面の導線をそのまま確認できます。',
  loginHeading: 'ログインまたは体験開始',
  loginBody: '登録済みなら前回の学習状況から再開。初めてなら登録なしの体験で、教材ホームと復習導線を先に確認できます。',
  signupHeading: '1分で学習を始める',
  signupBody: '登録後はすぐにレベル診断へ進みます。表示名はランキングやプロフィールに表示されます。',
  helperLogin: '初めて利用する場合は体験から進むか、「新規登録」に切り替えて表示名・メールアドレス・パスワードを入力してください。',
  helperSignup: '登録後は自動でログインし、初回レベル診断とプロフィール設定に進みます。',
} as const;
