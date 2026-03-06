import React, { useEffect, useState } from 'react';
import { storage } from '../services/storage';
import { generateInstructorFollowUp } from '../services/gemini';
import { StudentSummary, StudentRiskLevel, SUBSCRIPTION_PLAN_LABELS, UserProfile } from '../types';
import { AlertCircle, Bell, CheckCircle2, Loader2, MessageSquareText, Search, Send, Sparkles, Users } from 'lucide-react';
import OfficialCatalogAccessPanel from './OfficialCatalogAccessPanel';
import WorksheetPrintLauncher from './WorksheetPrintLauncher';

interface InstructorDashboardProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
}

const getRiskStyle = (risk: StudentRiskLevel) => {
  switch (risk) {
    case StudentRiskLevel.DANGER:
      return 'bg-red-50 text-red-700 border-red-200';
    case StudentRiskLevel.WARNING:
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
};

const getPlanStyle = (plan?: StudentSummary['subscriptionPlan']) => {
  if (!plan) return 'bg-medace-50 text-medace-700 border-medace-100';
  if (plan === 'TOB_PAID') return 'bg-medace-900 text-white border-medace-900';
  if (plan === 'TOB_FREE') return 'bg-medace-100 text-medace-800 border-medace-200';
  if (plan === 'TOC_PAID') return 'bg-medace-50 text-medace-700 border-medace-200';
  return 'bg-white text-medace-700 border-medace-200';
};

const getRiskLabel = (risk: StudentRiskLevel) => {
  switch (risk) {
    case StudentRiskLevel.DANGER:
      return '要フォロー';
    case StudentRiskLevel.WARNING:
      return '見守り';
    default:
      return '安定';
  }
};

const buildFallbackMessage = (student: StudentSummary, instructorName: string): string => {
  const days = student.lastActive > 0 ? Math.floor((Date.now() - student.lastActive) / (1000 * 60 * 60 * 24)) : 0;
  if (student.riskLevel === StudentRiskLevel.DANGER) {
    return `${instructorName}より: ${student.name}さん、${days}日ほど学習が空いているので、今日はまず10語だけ復習して流れを戻しましょう。短時間で大丈夫です。`;
  }
  if (student.riskLevel === StudentRiskLevel.WARNING) {
    return `${instructorName}より: ${student.name}さん、このまま少しずつ続ければ安定します。今日は前回の復習を15分だけ進めてみましょう。`;
  }
  return `${instructorName}より: ${student.name}さん、良いペースです。次回も同じリズムで続けて、定着を一段上げていきましょう。`;
};

const getTriggerReason = (student: StudentSummary): string => {
  if (student.riskLevel === StudentRiskLevel.DANGER) return '離脱リスクフォロー';
  if (student.riskLevel === StudentRiskLevel.WARNING) return '学習再開フォロー';
  return '継続称賛フォロー';
};

const InstructorDashboard: React.FC<InstructorDashboardProps> = ({ user, onSelectBook }) => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'DANGER'>('ALL');
  const [query, setQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [usedAi, setUsedAi] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await storage.getAllStudentsProgress();
      setStudents(data);
    } catch (loadError) {
      console.error(loadError);
      setError((loadError as Error).message || '生徒データの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const atRiskCount = students.filter((student) => student.riskLevel === StudentRiskLevel.DANGER).length;
  const filteredStudents = students.filter((student) => {
    if (filter === 'DANGER' && student.riskLevel !== StudentRiskLevel.DANGER) return false;
    if (query.trim()) {
      const keyword = query.trim().toLowerCase();
      return student.name.toLowerCase().includes(keyword) || student.email.toLowerCase().includes(keyword);
    }
    return true;
  });

  const openComposer = (student: StudentSummary) => {
    setSelectedStudent(student);
    setMessageDraft(buildFallbackMessage(student, user.displayName));
    setCustomInstruction('');
    setUsedAi(false);
  };

  const closeComposer = () => {
    setSelectedStudent(null);
    setMessageDraft('');
    setCustomInstruction('');
    setUsedAi(false);
  };

  const handleGenerateDraft = async () => {
    if (!selectedStudent) return;
    setDrafting(true);
    try {
      const daysSinceActive = selectedStudent.lastActive > 0
        ? Math.max(0, Math.floor((Date.now() - selectedStudent.lastActive) / (1000 * 60 * 60 * 24)))
        : 0;
      const draft = await generateInstructorFollowUp({
        instructorName: user.displayName,
        studentName: selectedStudent.name,
        riskLevel: selectedStudent.riskLevel,
        daysSinceActive,
        totalLearned: selectedStudent.totalLearned,
        currentLevel: undefined,
        customInstruction,
      });
      if (draft?.message) {
        setMessageDraft(draft.message);
        setUsedAi(true);
      } else {
        setMessageDraft(buildFallbackMessage(selectedStudent, user.displayName));
        setUsedAi(false);
      }
    } catch (draftError) {
      console.error(draftError);
      setNotice((draftError as Error).message || 'AI下書きの生成に失敗しました。');
    } finally {
      setDrafting(false);
    }
  };

  const handleSendNotification = async () => {
    if (!selectedStudent || !messageDraft.trim()) return;
    setSending(true);
    try {
      await storage.sendInstructorNotification(
        selectedStudent.uid,
        messageDraft.trim(),
        getTriggerReason(selectedStudent),
        usedAi
      );
      setNotice(`${selectedStudent.name}さんへ講師名入りのフォロー通知を保存しました。`);
      closeComposer();
      await fetchData();
    } catch (sendError) {
      console.error(sendError);
      setNotice((sendError as Error).message || 'フォロー通知の保存に失敗しました。');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-500">生徒データを分析中...</div>;
  }

  if (error) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const planMissingCount = students.filter((student) => !student.hasLearningPlan).length;
  const unassignedVisibleCount = students.filter((student) => !student.assignedInstructorUid).length;

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-medace-900/35 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 md:p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">Follow-up Message</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{selectedStudent.name}さんへの通知</h3>
                <p className="mt-2 text-sm text-slate-500">
                  生徒には <span className="font-bold text-slate-700">{user.displayName}</span> 名義で自然な日本語の通知が表示されます。
                </p>
              </div>
              <button type="button" onClick={closeComposer} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                閉じる
              </button>
            </div>

            <div className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className={`rounded-full border px-2.5 py-1 ${getRiskStyle(selectedStudent.riskLevel)}`}>
                  {getRiskLabel(selectedStudent.riskLevel)}
                </span>
                {selectedStudent.subscriptionPlan && (
                  <span className={`rounded-full border px-2.5 py-1 ${getPlanStyle(selectedStudent.subscriptionPlan)}`}>
                    {SUBSCRIPTION_PLAN_LABELS[selectedStudent.subscriptionPlan]}
                  </span>
                )}
              </div>
              {selectedStudent.riskReasons && selectedStudent.riskReasons.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedStudent.riskReasons.map((reason) => (
                    <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      {reason}
                    </span>
                  ))}
                </div>
              )}
              {selectedStudent.recommendedAction && (
                <div className="rounded-2xl border border-medace-100 bg-white px-4 py-3 text-sm text-slate-700">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-medace-600">おすすめの次の一手</div>
                  <div className="mt-2 leading-relaxed">{selectedStudent.recommendedAction}</div>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">AIへの補足</label>
                <input
                  type="text"
                  value={customInstruction}
                  onChange={(event) => setCustomInstruction(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                  placeholder="例: 優しく、でも今日やることを明確に"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={drafting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-300 hover:text-medace-700 disabled:opacity-50"
              >
                {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                AIで下書きを作る
              </button>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">送信文面</label>
                <textarea
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  className="min-h-36 w-full rounded-3xl border border-slate-300 bg-white px-4 py-4 text-sm leading-relaxed text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                />
                <p className="mt-2 text-xs text-slate-400">
                  AI下書きが使えない場合でも、この文面をそのまま編集して送れます。
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeComposer} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSendNotification}
                disabled={sending || !messageDraft.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                講師名で通知を送る
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      )}

      {atRiskCount > 0 && (
        <div className="relative overflow-hidden rounded-[30px] bg-red-600 px-6 py-6 text-white shadow-xl">
          <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 opacity-10">
            <AlertCircle size={160} />
          </div>
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-red-100">
                <AlertCircle className="w-4 h-4" /> 要フォロー
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight">学習が止まりかけている生徒が {atRiskCount} 名います</h2>
              <p className="mt-2 text-sm text-red-100">担当講師名のまま自然な日本語で通知し、再開のハードルを下げます。</p>
            </div>
            <button
              type="button"
              onClick={() => setFilter('DANGER')}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              要注意だけ見る
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[32px] bg-[linear-gradient(135deg,#2F1609_0%,#66321A_42%,#F66D0B_100%)] p-8 text-white shadow-[0_24px_60px_rgba(228,94,4,0.18)]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Coach Space</p>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/90">
              グループ講師
            </span>
            {user.organizationName && (
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/90">
                {user.organizationName}
              </span>
            )}
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight">担当生徒の再開導線を、文面まで整える</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/72">
            グループ内の担当生徒と未割当生徒を見ながら、離脱リスクの理由を確認し、講師名義の通知文まで下書きして、そのまま送るか調整して送るかを選べます。
          </p>

          <div className="mt-8 grid gap-3">
            {[
              '離脱リスクの高い生徒から優先的に表示',
              '担当割当済みの生徒と未割当生徒だけを一覧化',
              '講師名で違和感のない日本語メッセージを作成',
              '送信後は生徒ダッシュボードにフォロー通知として表示',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/82">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-slate-500">
              <Users className="w-5 h-5 text-medace-500" />
              <span className="text-sm font-bold">登録生徒</span>
            </div>
            <div className="mt-4 text-4xl font-black tracking-tight text-slate-950">{students.length}</div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-slate-500">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm font-bold">高リスク</span>
            </div>
            <div className="mt-4 text-4xl font-black tracking-tight text-red-600">{atRiskCount}</div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-slate-500">
              <CheckCircle2 className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-bold">プラン未設定</span>
            </div>
            <div className="mt-4 text-4xl font-black tracking-tight text-slate-950">{planMissingCount}</div>
            <div className="mt-2 text-sm text-slate-500">未割当表示 {unassignedVisibleCount} 名</div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-slate-500">
              <MessageSquareText className="w-5 h-5 text-sky-500" />
              <span className="text-sm font-bold">今週の通知</span>
            </div>
            <div className="mt-4 text-4xl font-black tracking-tight text-slate-950">
              {students.filter((student) => student.lastNotificationAt && Date.now() - student.lastNotificationAt < 7 * 86400000).length}
            </div>
          </div>
        </div>
      </div>

      <OfficialCatalogAccessPanel
        user={user}
        onSelectBook={onSelectBook}
        eyebrow="Business Demo Catalog"
        title="ビジネス版の既存単語帳をそのまま確認する"
        description="先生体験アカウントでも、既存の公式単語帳をそのまま開けます。学習画面に入ることも、テストで英日・日英・先頭2文字ヒントを切り替えることもできます。"
      />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-2xl font-black tracking-tight text-slate-950">フォロー対象一覧</h3>
          <p className="mt-2 text-sm text-slate-500">プラン種別、直近通知、学習停止日数までまとめて確認できます。</p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <WorksheetPrintLauncher user={user} />
          <div className="flex rounded-2xl bg-white p-1 shadow-sm border border-slate-200">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === 'ALL' ? 'bg-medace-700 text-white' : 'text-slate-500'}`}
            >
              全生徒
            </button>
            <button
              type="button"
              onClick={() => setFilter('DANGER')}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === 'DANGER' ? 'bg-medace-700 text-white' : 'text-slate-500'}`}
            >
              要注意
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="生徒名・メールで検索"
              className="w-56 text-sm text-slate-700 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[0.72fr_1.1fr_0.72fr_0.86fr_1.08fr_1fr_0.84fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
          <div>リスク</div>
          <div>生徒</div>
          <div>プラン</div>
          <div>学習状況</div>
          <div>介入理由</div>
          <div>最新フォロー</div>
          <div className="text-right">操作</div>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-500">該当する生徒はいません。</div>
        ) : (
          filteredStudents.map((student) => {
            const daysSinceActive = student.lastActive > 0
              ? Math.floor((Date.now() - student.lastActive) / (1000 * 60 * 60 * 24))
              : null;
            return (
              <div key={student.uid} className="grid grid-cols-[0.72fr_1.1fr_0.72fr_0.86fr_1.08fr_1fr_0.84fr] gap-4 border-b border-slate-100 px-6 py-5 text-sm last:border-b-0">
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getRiskStyle(student.riskLevel)}`}>
                    {getRiskLabel(student.riskLevel)}
                  </span>
                </div>
                <div>
                  <div className="font-bold text-slate-900">{student.name}</div>
                  <div className="mt-1 text-xs text-slate-400">{student.email}</div>
                  {student.organizationName && <div className="mt-1 text-xs text-slate-400">{student.organizationName}</div>}
                  <div className="mt-1 text-xs text-slate-400">
                    担当: {student.assignedInstructorName || '未割当'}
                  </div>
                </div>
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getPlanStyle(student.subscriptionPlan)}`}>
                    {student.subscriptionPlan ? SUBSCRIPTION_PLAN_LABELS[student.subscriptionPlan] : '未設定'}
                  </span>
                  <div className="mt-2 text-xs text-slate-400">
                    {student.hasLearningPlan ? '学習プラン設定済み' : '学習プラン未設定'}
                  </div>
                </div>
                <div>
                  <div className="font-bold text-medace-600">{student.totalLearned} 語</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {daysSinceActive === null ? '未学習' : `${daysSinceActive}日ぶり`}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">正答率 {Math.round((student.accuracy || 0) * 100)}%</div>
                </div>
                <div>
                  <div className="flex flex-wrap gap-2">
                    {(student.riskReasons || []).map((reason) => (
                      <span key={reason} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        {reason}
                      </span>
                    ))}
                  </div>
                  {student.recommendedAction && (
                    <div className="mt-3 rounded-2xl border border-medace-100 bg-medace-50/60 px-3 py-3 text-xs leading-relaxed text-medace-900">
                      次アクション: {student.recommendedAction}
                    </div>
                  )}
                </div>
                <div>
                  {student.lastNotificationAt ? (
                    <>
                      <div className="text-xs font-bold text-slate-400">
                        {new Date(student.lastNotificationAt).toLocaleDateString('ja-JP')}
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm text-slate-600">{student.lastNotificationMessage}</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-400">まだ通知なし</div>
                  )}
                </div>
                <div className="flex items-center justify-end">
                  {student.riskLevel !== StudentRiskLevel.SAFE ? (
                    <button
                      type="button"
                      onClick={() => openComposer(student)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100"
                    >
                      <Bell className="w-3.5 h-3.5" /> 通知を送る
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" /> 安定
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default InstructorDashboard;
