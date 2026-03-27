import React, { useMemo, useState } from 'react';
import type { CommercialRequestPayload } from '../../contracts/storage';
import {
  COMMERCIAL_REQUEST_KIND_LABELS,
  COMMERCIAL_WORKSPACE_ROLE_LABELS,
  CommercialRequestKind,
  CommercialWorkspaceRole,
  TEACHING_FORMAT_LABELS,
  TeachingFormat,
} from '../../types';

interface CommercialRequestFormProps {
  title: string;
  description: string;
  source: string;
  submitLabel: string;
  availableKinds: CommercialRequestKind[];
  defaultKind: CommercialRequestKind;
  defaultContactName?: string;
  defaultContactEmail?: string;
  defaultOrganizationName?: string;
  onSubmit: (payload: CommercialRequestPayload) => Promise<void>;
}

const ROLE_OPTIONS = [
  CommercialWorkspaceRole.STUDENT,
  CommercialWorkspaceRole.INSTRUCTOR,
  CommercialWorkspaceRole.GROUP_ADMIN,
];

const TEACHING_FORMAT_OPTIONS = [
  TeachingFormat.ONLINE,
  TeachingFormat.HYBRID,
  TeachingFormat.IN_PERSON,
];

const CommercialRequestForm: React.FC<CommercialRequestFormProps> = ({
  title,
  description,
  source,
  submitLabel,
  availableKinds,
  defaultKind,
  defaultContactName = '',
  defaultContactEmail = '',
  defaultOrganizationName = '',
  onSubmit,
}) => {
  const [kind, setKind] = useState<CommercialRequestKind>(defaultKind);
  const [contactName, setContactName] = useState(defaultContactName);
  const [contactEmail, setContactEmail] = useState(defaultContactEmail);
  const [organizationName, setOrganizationName] = useState(defaultOrganizationName);
  const [teachingFormat, setTeachingFormat] = useState<TeachingFormat>(TeachingFormat.ONLINE);
  const [desiredStartTiming, setDesiredStartTiming] = useState('');
  const [requestedWorkspaceRole, setRequestedWorkspaceRole] = useState<CommercialWorkspaceRole>(CommercialWorkspaceRole.GROUP_ADMIN);
  const [seatEstimate, setSeatEstimate] = useState('31-100名');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requiresOrganization = kind !== CommercialRequestKind.PERSONAL_UPGRADE;

  const seatPlaceholder = useMemo(() => (
    kind === CommercialRequestKind.PERSONAL_UPGRADE ? '個人利用' : seatEstimate
  ), [kind, seatEstimate]);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Commercial Request</p>
        <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      </div>

      <div className="mt-5 space-y-4" data-testid="commercial-request-form">
        <div>
          <label className="ui-form-label">相談種別</label>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {availableKinds.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition-colors ${
                  kind === option
                    ? 'border-medace-500 bg-medace-50 text-medace-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-medace-200 hover:text-medace-700'
                }`}
              >
                {COMMERCIAL_REQUEST_KIND_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="ui-form-label">担当者名</label>
            <input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              className="ui-input mt-2"
              placeholder="例: 田中 直人"
            />
          </div>
          <div>
            <label className="ui-form-label">連絡先メール</label>
            <input
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              className="ui-input mt-2"
              placeholder="teacher@example.jp"
            />
          </div>
        </div>

        {requiresOrganization && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="ui-form-label">学校名・教室名</label>
              <input
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                className="ui-input mt-2"
                placeholder="例: Steady Study English Academy"
              />
            </div>
            <div>
              <label className="ui-form-label">希望する役割</label>
              <select
                value={requestedWorkspaceRole}
                onChange={(event) => setRequestedWorkspaceRole(event.target.value as CommercialWorkspaceRole)}
                className="ui-input mt-2"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{COMMERCIAL_WORKSPACE_ROLE_LABELS[option]}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {requiresOrganization && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="ui-form-label">授業形態</label>
              <select
                value={teachingFormat}
                onChange={(event) => setTeachingFormat(event.target.value as TeachingFormat)}
                className="ui-input mt-2"
              >
                {TEACHING_FORMAT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{TEACHING_FORMAT_LABELS[option]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-form-label">想定人数</label>
              <input
                value={seatEstimate}
                onChange={(event) => setSeatEstimate(event.target.value)}
                className="ui-input mt-2"
                placeholder={seatPlaceholder}
              />
            </div>
          </div>
        )}

        <div>
          <label className="ui-form-label">開始したい時期</label>
          <input
            value={desiredStartTiming}
            onChange={(event) => setDesiredStartTiming(event.target.value)}
            className="ui-input mt-2"
            placeholder="例: 4月中にトライアル開始 / 来学期から本導入"
          />
        </div>

        <div>
          <label className="ui-form-label">相談内容</label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="ui-input mt-2 min-h-[120px]"
            placeholder="いま困っていること、確認したいこと、導入希望時期など"
          />
        </div>

        {notice && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            {notice}
          </div>
        )}

        <button
          type="button"
          data-testid="commercial-request-submit"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            setNotice(null);
            try {
              await onSubmit({
                kind,
                contactName,
                contactEmail,
                organizationName: requiresOrganization ? organizationName : undefined,
                teachingFormat: requiresOrganization ? teachingFormat : undefined,
                desiredStartTiming: desiredStartTiming.trim() || undefined,
                requestedWorkspaceRole: requiresOrganization ? requestedWorkspaceRole : undefined,
                seatEstimate: requiresOrganization ? seatEstimate : undefined,
                message,
                source,
              });
              setNotice('申請を送信しました。担当者からの案内をお待ちください。');
              setMessage('');
            } catch (error) {
              setNotice((error as Error).message || '申請送信に失敗しました。');
            } finally {
              setSubmitting(false);
            }
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-medace-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {submitting ? '送信中...' : submitLabel}
        </button>
      </div>
    </div>
  );
};

export default CommercialRequestForm;
