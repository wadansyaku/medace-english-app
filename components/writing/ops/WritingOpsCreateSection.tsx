import React from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';

import type { StudentSummary, WritingPromptTemplate } from '../../../types';

interface WritingOpsCreateSectionProps {
  templates: WritingPromptTemplate[];
  students: StudentSummary[];
  selectedStudentUid: string;
  selectedTemplateId: string;
  selectedStudent: StudentSummary | null;
  selectedTemplate: WritingPromptTemplate | null;
  topicHint: string;
  notes: string;
  generating: boolean;
  onSelectStudent: (studentUid: string) => void;
  onSelectTemplate: (templateId: string) => void;
  onTopicHintChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onGenerate: () => void;
}

const WritingOpsCreateSection: React.FC<WritingOpsCreateSectionProps> = ({
  templates,
  students,
  selectedStudentUid,
  selectedTemplateId,
  selectedStudent,
  selectedTemplate,
  topicHint,
  notes,
  generating,
  onSelectStudent,
  onSelectTemplate,
  onTopicHintChange,
  onNotesChange,
  onGenerate,
}) => (
  <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
    <div className="rounded-[28px] border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-medace-600" />
        <div>
          <h4 className="text-lg font-black text-slate-950">新しい課題を作る</h4>
          <p className="mt-1 text-sm text-slate-500">対象生徒とテンプレートを決めて、紙配布前の課題を作成します。</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">対象生徒</label>
          <select
            data-testid="writing-student-select"
            value={selectedStudentUid}
            onChange={(event) => onSelectStudent(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          >
            <option value="">生徒を選択</option>
            {students.map((student) => (
              <option key={student.uid} value={student.uid}>{student.name} / {student.email}</option>
            ))}
          </select>
          {students.length === 0 && (
            <div className="mt-2 text-sm font-bold text-amber-700">
              対象になる有料ビジネス生徒がまだいません。
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">テンプレート</label>
          <select
            data-testid="writing-template-select"
            value={selectedTemplateId}
            onChange={(event) => onSelectTemplate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          >
            <option value="">テンプレートを選択</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title} / {template.defaultWordCountMin}-{template.defaultWordCountMax}語
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">テーマ補足</label>
          <input
            type="text"
            value={topicHint}
            onChange={(event) => onTopicHintChange(event.target.value)}
            placeholder="例: 学校でのICT活用"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">講師メモ</label>
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="面談で確認したい観点や、扱ってほしい具体例"
            className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          />
        </div>
        <button
          type="button"
          data-testid="writing-generate-submit"
          disabled={generating || !selectedStudentUid || !selectedTemplateId}
          onClick={onGenerate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          課題を生成する
        </button>
        {(!selectedStudentUid || !selectedTemplateId) && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>対象生徒とテンプレートを選ぶと、配布前の課題を生成できます。</span>
          </div>
        )}
      </div>
    </div>

    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Generation Preview</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white bg-white px-5 py-5">
            <div className="text-sm font-bold text-slate-950">対象生徒</div>
            {selectedStudent ? (
              <>
                <div className="mt-3 text-lg font-black text-slate-950">{selectedStudent.name}</div>
                <div className="mt-1 text-sm text-slate-500">{selectedStudent.email}</div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {selectedStudent.recommendedAction || '日々の進行に合わせて作文課題を調整します。'}
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-slate-500">左側で生徒を選ぶとここに対象が表示されます。</div>
            )}
          </div>
          <div className="rounded-3xl border border-white bg-white px-5 py-5">
            <div className="text-sm font-bold text-slate-950">テンプレート</div>
            {selectedTemplate ? (
              <>
                <div className="mt-3 text-lg font-black text-slate-950">{selectedTemplate.title}</div>
                <div className="mt-1 text-sm text-slate-500">{selectedTemplate.examCategory} / {selectedTemplate.templateType}</div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {selectedTemplate.defaultWordCountMin}-{selectedTemplate.defaultWordCountMax}語 / {selectedTemplate.sampleTopic || 'テーマ自由'}
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-slate-500">左側でテンプレートを選ぶと課題条件が表示されます。</div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Template Bank</div>
            <h4 className="mt-1 text-lg font-black text-slate-950">テンプレート一覧</h4>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
            {templates.length} 件
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {templates.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm leading-relaxed text-slate-500 sm:col-span-2">
              利用できる Writing テンプレートがまだありません。テンプレートが同期されると、ここから選択できます。
            </div>
          )}
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectTemplate(template.id)}
              className={`rounded-3xl border px-5 py-4 text-left ${
                selectedTemplateId === template.id
                  ? 'border-medace-300 bg-medace-50/80'
                  : 'border-slate-200 bg-slate-50 hover:border-medace-200'
              }`}
            >
              <div className="text-sm font-bold text-slate-950">{template.title}</div>
              <div className="mt-2 text-xs text-slate-400">{template.templateType}</div>
              <div className="mt-3 text-sm leading-relaxed text-slate-600">{template.promptBase}</div>
              <div className="mt-4 rounded-2xl border border-white bg-white px-4 py-3 text-xs text-slate-500">
                {template.defaultWordCountMin}-{template.defaultWordCountMax} words / {template.sampleTopic || '自由設定'}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  </div>
);

export default WritingOpsCreateSection;
