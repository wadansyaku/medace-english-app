import { OrganizationRole, UserRole } from '../types';
import type { RuntimeFlags } from './runtimeFlags';

export type PublicBusinessRoleKey =
  | 'student'
  | 'instructor'
  | 'group-admin'
  | 'service-admin';

type PublicBusinessRoleIcon = 'student' | 'instructor' | 'group-admin' | 'service-admin';

export interface PublicBusinessRoleHighlight {
  label: string;
  detail: string;
}

export interface PublicBusinessRoleConfig {
  key: PublicBusinessRoleKey;
  slug: PublicBusinessRoleKey;
  icon: PublicBusinessRoleIcon;
  cardTestId: string;
  cardActionTestId: string;
  pageTestId: string;
  primaryActionTestId: string;
  title: string;
  audienceLabel: string;
  cardDescription: string;
  cardDetail: string;
  summary: string;
  primaryActionSummary: string;
  highlights: PublicBusinessRoleHighlight[];
  demoRole: UserRole;
  demoOrganizationRole?: OrganizationRole;
  requestSource: string;
  requestTitle: string;
  requestDescription: string;
}

export interface PublicBusinessRolePrimaryAction {
  kind: 'demo' | 'request';
  label: string;
  note: string;
}

export const PUBLIC_BUSINESS_ROLE_CONFIGS: PublicBusinessRoleConfig[] = [
  {
    key: 'student',
    slug: 'student',
    icon: 'student',
    cardTestId: 'business-role-preview-student',
    cardActionTestId: 'open-public-role-student',
    pageTestId: 'public-role-page-student',
    primaryActionTestId: 'demo-login-business-student',
    title: 'ビジネス版 生徒',
    audienceLabel: 'Student Role',
    cardDescription: '講師フォロー通知と教材配信の前提で学習画面を確認します。',
    cardDetail: '授業運用に乗る生徒導線、配布教材、添削返却の受け取りを確認',
    summary: '授業で配られた教材に取り組み、講師からのフォローや添削返却を受け取る役割です。',
    primaryActionSummary: '学習開始から返却確認まで、授業運用に乗る生徒導線をそのまま見られます。',
    highlights: [
      {
        label: '配布教材の受け取り',
        detail: '学校や教室から配布された教材を、個人学習の流れを崩さずに確認できます。',
      },
      {
        label: '課題と復習の両立',
        detail: '宿題としての学習と、自分のペースで進める復習を同じホームから扱います。',
      },
      {
        label: '添削返却の受信',
        detail: '英作文や講師コメントを受け取り、次の学習アクションへつなげます。',
      },
    ],
    demoRole: UserRole.STUDENT,
    demoOrganizationRole: OrganizationRole.STUDENT,
    requestSource: 'PUBLIC_ROLE_STUDENT',
    requestTitle: 'ビジネス版 生徒導線について相談する',
    requestDescription: '教材配信、生徒アカウント発行、授業運用への組み込み方をまとめて相談できます。',
  },
  {
    key: 'instructor',
    slug: 'instructor',
    icon: 'instructor',
    cardTestId: 'business-role-preview-instructor',
    cardActionTestId: 'open-public-role-instructor',
    pageTestId: 'public-role-page-instructor',
    primaryActionTestId: 'demo-login-instructor',
    title: '講師',
    audienceLabel: 'Instructor Role',
    cardDescription: '優先生徒の抽出、通知文の作成、添削キューを確認します。',
    cardDetail: '生徒一覧、通知、英作文 review の代表画面を確認',
    summary: '担当生徒のフォロー、添削、学習停滞者への介入を担う教室・学校向けの運用役割です。',
    primaryActionSummary: 'フォロー対象の抽出から通知、添削キューまでを 1 つの導線で確認できます。',
    highlights: [
      {
        label: '要対応生徒の抽出',
        detail: '停滞・未着手・再開待ちの生徒をまとめて見つけ、優先順に追えます。',
      },
      {
        label: '通知と声かけ',
        detail: '授業前後の連絡や個別フォロー文を、運用文脈に合わせて整理できます。',
      },
      {
        label: '英作文 review',
        detail: '提出物の確認、レビュー依頼、返却待ちの状態をひとまとまりで扱えます。',
      },
    ],
    demoRole: UserRole.INSTRUCTOR,
    demoOrganizationRole: OrganizationRole.INSTRUCTOR,
    requestSource: 'PUBLIC_ROLE_INSTRUCTOR',
    requestTitle: '講師運用の導入を相談する',
    requestDescription: '講師アカウント発行、担当割当、添削フローの運用設計をまとめて相談できます。',
  },
  {
    key: 'group-admin',
    slug: 'group-admin',
    icon: 'group-admin',
    cardTestId: 'business-role-preview-admin',
    cardActionTestId: 'open-public-role-group-admin',
    pageTestId: 'public-role-page-group-admin',
    primaryActionTestId: 'demo-login-group-admin',
    title: '学校管理者',
    audienceLabel: 'Group Admin Role',
    cardDescription: '担当割当、導入運用、KPI の見え方を確認します。',
    cardDetail: '組織ダッシュボード、担当割当、運用指標の代表画面を確認',
    summary: '学校・教室の運用責任者として、講師配置、導入の進捗、継続率指標を俯瞰する役割です。',
    primaryActionSummary: '組織の状況を俯瞰しながら、担当割当と運用改善のポイントを確認できます。',
    highlights: [
      {
        label: '組織ダッシュボード',
        detail: '生徒数、担当状況、直近アクションの偏りをまとめて見て判断できます。',
      },
      {
        label: '講師配置と権限',
        detail: '講師や担当クラスの割当を確認し、運用上の抜け漏れを減らせます。',
      },
      {
        label: '導入 KPI の把握',
        detail: '継続率や未着手率をもとに、現場で次に打つべき施策を整理できます。',
      },
    ],
    demoRole: UserRole.INSTRUCTOR,
    demoOrganizationRole: OrganizationRole.GROUP_ADMIN,
    requestSource: 'PUBLIC_ROLE_GROUP_ADMIN',
    requestTitle: '学校管理者向け導入を相談する',
    requestDescription: '組織ダッシュボード、講師割当、導入 KPI の見え方を前提に導入相談を進められます。',
  },
  {
    key: 'service-admin',
    slug: 'service-admin',
    icon: 'service-admin',
    cardTestId: 'business-role-preview-service-admin',
    cardActionTestId: 'open-public-role-service-admin',
    pageTestId: 'public-role-page-service-admin',
    primaryActionTestId: 'demo-login-admin',
    title: 'サービス管理者',
    audienceLabel: 'Service Admin Role',
    cardDescription: '導入相談キュー、お知らせ配信、教材運用の管理画面を確認します。',
    cardDetail: 'AdminPanel、運用設定、全体お知らせの配信画面を確認',
    summary: 'サービス全体の導入運用、お知らせ配信、教材メンテナンスを担うサービス側の管理役割です。',
    primaryActionSummary: '全体配信、お知らせ、導入相談の運用導線を service admin 視点で確認できます。',
    highlights: [
      {
        label: '導入相談キュー',
        detail: '学校・教室から届く相談を一覧で見て、次の対応先を整理できます。',
      },
      {
        label: 'お知らせ配信',
        detail: '全体告知やロール別のアナウンスを、配信対象ごとに出し分けられます。',
      },
      {
        label: '教材と設定の保守',
        detail: '教材カタログや運用設定の変更を、サービス全体への影響を見ながら扱えます。',
      },
    ],
    demoRole: UserRole.ADMIN,
    requestSource: 'PUBLIC_ROLE_SERVICE_ADMIN',
    requestTitle: 'サービス管理画面について相談する',
    requestDescription: 'サービス側の運用体制や管理権限を前提に、導入・運用フローをまとめて相談できます。',
  },
];

export const PUBLIC_BUSINESS_ROLE_KEYS = PUBLIC_BUSINESS_ROLE_CONFIGS.map((role) => role.key);

const PUBLIC_BUSINESS_ROLE_CONFIG_MAP = new Map(
  PUBLIC_BUSINESS_ROLE_CONFIGS.map((role) => [role.key, role] as const),
);

export const isPublicBusinessRoleKey = (value: string): value is PublicBusinessRoleKey => (
  PUBLIC_BUSINESS_ROLE_CONFIG_MAP.has(value as PublicBusinessRoleKey)
);

export const parsePublicBusinessRoleKey = (value: string): PublicBusinessRoleKey | null => (
  isPublicBusinessRoleKey(value) ? value : null
);

export const getPublicBusinessRoleConfig = (roleKey: PublicBusinessRoleKey): PublicBusinessRoleConfig => {
  const config = PUBLIC_BUSINESS_ROLE_CONFIG_MAP.get(roleKey);
  if (!config) {
    throw new Error(`Unknown public business role: ${roleKey}`);
  }
  return config;
};

export const getPublicBusinessRolePath = (roleKey: PublicBusinessRoleKey): string => (
  `/public/roles/${getPublicBusinessRoleConfig(roleKey).slug}`
);

export const isPublicBusinessRoleDemoEnabled = (
  roleKey: PublicBusinessRoleKey,
  runtimeFlags: RuntimeFlags,
): boolean => (
  roleKey === 'service-admin'
    ? runtimeFlags.enableAdminDemo
    : runtimeFlags.enablePublicBusinessDemo
);

export const getPublicBusinessRolePrimaryAction = (
  roleKey: PublicBusinessRoleKey,
  runtimeFlags: RuntimeFlags,
): PublicBusinessRolePrimaryAction => (
  isPublicBusinessRoleDemoEnabled(roleKey, runtimeFlags)
    ? {
        kind: 'demo',
        label: 'この役割を試す',
        note: roleKey === 'service-admin'
          ? '管理用デモはパスワード確認のあとに開始します。'
          : 'ページ訪問時には自動ログインせず、クリックで体験を開始します。',
      }
    : {
        kind: 'request',
        label: '導入相談へ進む',
        note: '本番相当の公開環境では、体験開始の代わりに導入相談フォームへ進みます。',
      }
);
