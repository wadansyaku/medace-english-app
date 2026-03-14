import React from 'react';

import ModalOverlay from '../ModalOverlay';

interface AdminDemoPromptProps {
  authError: string | null;
  password: string;
  onPasswordChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}

const AdminDemoPrompt: React.FC<AdminDemoPromptProps> = ({
  authError,
  password,
  onPasswordChange,
  onClose,
  onSubmit,
}) => (
  <ModalOverlay onClose={onClose} panelClassName="max-w-md" align="center">
    <form
      onSubmit={onSubmit}
      className="rounded-[28px] border border-medace-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
    >
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Admin Demo</div>
      <h2 className="mt-3 text-2xl font-black text-slate-950">管理者デモを開く</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        サービス管理者デモには管理用パスワードが必要です。ローカルでは `admin` が既定値です。
      </p>
      <label className="mt-5 block">
        <span className="ui-form-label mb-2 block">管理用パスワード</span>
        <input
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          className="ui-input"
          autoFocus
          data-testid="admin-demo-password"
        />
      </label>
      {authError && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {authError}
        </div>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
        >
          キャンセル
        </button>
        <button
          type="submit"
          data-testid="admin-demo-submit"
          className="flex-1 rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-700"
        >
          デモを開く
        </button>
      </div>
    </form>
  </ModalOverlay>
);

export default AdminDemoPrompt;
