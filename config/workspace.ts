import {
  BusinessAdminWorkspaceView,
  InstructorWorkspaceView,
  type WorkspaceSectionDefinition,
} from '../types';

export const INSTRUCTOR_WORKSPACE_SECTIONS: WorkspaceSectionDefinition<InstructorWorkspaceView>[] = [
  {
    id: InstructorWorkspaceView.OVERVIEW,
    label: '概要',
    shortLabel: '概要',
    description: '今日優先するフォローと運用全体の状況を見る',
  },
  {
    id: InstructorWorkspaceView.STUDENTS,
    label: '生徒',
    shortLabel: '生徒',
    description: '優先生徒の一覧確認と通知作成を行う',
  },
  {
    id: InstructorWorkspaceView.WRITING,
    label: '作文',
    shortLabel: '作文',
    description: '自由英作文の作成、添削、返却を進める',
  },
  {
    id: InstructorWorkspaceView.WORKSHEETS,
    label: 'プリント',
    shortLabel: '問題',
    description: '紙配布用のワークシートを印刷する',
  },
  {
    id: InstructorWorkspaceView.CATALOG,
    label: '教材',
    shortLabel: '教材',
    description: '必要なときだけ教材カタログを確認する',
  },
];

export const BUSINESS_ADMIN_WORKSPACE_SECTIONS: WorkspaceSectionDefinition<BusinessAdminWorkspaceView>[] = [
  {
    id: BusinessAdminWorkspaceView.OVERVIEW,
    label: '概要',
    shortLabel: '概要',
    description: '組織運用の詰まりと今の優先事項を確認する',
  },
  {
    id: BusinessAdminWorkspaceView.ASSIGNMENTS,
    label: '割当',
    shortLabel: '割当',
    description: '講師担当の割当と更新履歴を管理する',
  },
  {
    id: BusinessAdminWorkspaceView.INSTRUCTORS,
    label: '講師',
    shortLabel: '講師',
    description: '講師ごとの稼働と負荷を比較する',
  },
  {
    id: BusinessAdminWorkspaceView.SETTINGS,
    label: '設定',
    shortLabel: '設定',
    description: '組織表示名、所属メンバー、監査ログを確認する',
  },
  {
    id: BusinessAdminWorkspaceView.WRITING,
    label: '作文',
    shortLabel: '作文',
    description: '自由英作文の運用状況と進捗を確認する',
  },
  {
    id: BusinessAdminWorkspaceView.WORKSHEETS,
    label: 'プリント',
    shortLabel: '問題',
    description: '配布用PDF問題を作成する',
  },
  {
    id: BusinessAdminWorkspaceView.CATALOG,
    label: '教材',
    shortLabel: '教材',
    description: '教材カタログを必要時だけ開く',
  },
];
