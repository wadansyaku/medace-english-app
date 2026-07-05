import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
} from 'lucide-react';

import { BRAND } from '../../config/brand';
import { sessionService } from '../../services/session';

interface PasswordResetScreenProps {
  token: string | null;
  onBackToLogin: () => void;
}

const PasswordResetScreen: React.FC<PasswordResetScreenProps> = ({
  token,
  onBackToLogin,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hasToken = Boolean(token);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError('再設定リンクが無効または期限切れです。');
      return;
    }
    if (password.length < 6) {
      setError('パスワードは6文字以上にしてください。');
      return;
    }
    if (password !== confirmPassword) {
      setError('確認用パスワードが一致しません。');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await sessionService.confirmPasswordReset(token, password);
      setSuccessMessage(result.message);
      setPassword('');
      setConfirmPassword('');
    } catch (resetError) {
      setError((resetError as Error).message || 'パスワードの更新に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-96px)] bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <button
          type="button"
          onClick={onBackToLogin}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          ログインに戻る
        </button>

        <section className="overflow-hidden rounded-panel border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-white px-6 py-6 sm:px-8">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-medace-200 bg-medace-50 text-xl font-black text-medace-800">
                {BRAND.mark}
              </div>
              <div>
                <p className="text-xs font-bold tracking-[0.14em] text-slate-400">PASSWORD RESET</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">パスワードを再設定</h1>
              </div>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-6 sm:px-8 lg:border-b-0 lg:border-r">
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-medace-700" />
                <div>
                  <p className="text-sm font-black text-slate-900">リンクから直接更新できます</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    新しいパスワードを設定すると、古いログイン状態は解除されます。更新後は新しいパスワードでログインしてください。
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-6 sm:px-8">
              {successMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-emerald-800">
                  <div className="flex items-center gap-2 text-base font-black">
                    <CheckCircle2 className="h-5 w-5" />
                    更新しました
                  </div>
                  <p className="mt-2 text-sm leading-relaxed">{successMessage}</p>
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800"
                  >
                    ログインする
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {!hasToken && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                      再設定リンクが確認できません。ログイン画面からもう一度リクエストしてください。
                    </div>
                  )}
                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                      {error}
                    </div>
                  )}
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">新しいパスワード</span>
                    <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-medace-400">
                      <Lock className="h-4 w-4 text-slate-400" />
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={!hasToken || loading}
                        minLength={6}
                        autoComplete="new-password"
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none disabled:text-slate-400"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">確認用パスワード</span>
                    <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-medace-400">
                      <Lock className="h-4 w-4 text-slate-400" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        disabled={!hasToken || loading}
                        minLength={6}
                        autoComplete="new-password"
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none disabled:text-slate-400"
                      />
                    </div>
                  </label>
                  <button
                    type="submit"
                    disabled={!hasToken || loading}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-medace-600 px-4 py-3 text-sm font-black text-slate-950 shadow-sm transition-colors hover:bg-medace-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    パスワードを更新
                  </button>
                </div>
              )}
            </form>
          </div>
        </section>
      </div>
    </main>
  );
};

export default PasswordResetScreen;
