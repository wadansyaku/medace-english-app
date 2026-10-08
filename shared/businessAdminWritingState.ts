export type BusinessAdminWritingState = 'NOT_INCLUDED' | 'UNAVAILABLE' | 'LOADING' | 'ERROR' | 'READY';

export const getBusinessAdminWritingNotice = (state: BusinessAdminWritingState): {
  value: string; title: string; description: string;
} | null => {
  switch (state) {
    case 'NOT_INCLUDED': return {
      value: '対象外', title: 'このプランでは作文機能を利用できません',
      description: '無料プランでは作文の配布・添削は対象外です。教材、単語学習、週次課題は引き続き利用できます。',
    };
    case 'UNAVAILABLE': return {
      value: '利用不可', title: 'この環境では作文機能を利用できません',
      description: '作文機能はCloudflareに接続した環境で利用できます。作文の件数は取得していません。',
    };
    case 'LOADING': return {
      value: '取得中', title: '作文情報を取得しています',
      description: '取得が完了すると、配布と添削の件数を表示します。',
    };
    case 'ERROR': return {
      value: '未取得', title: '作文情報を取得できませんでした',
      description: '再読み込みして作文情報を取得してください。現在の件数は確認できていません。',
    };
    case 'READY': return null;
  }
};
