import React, { useEffect, useMemo, useState } from 'react';
import type { CommercialRequestUpdatePayload, ProductAnnouncementUpsertPayload } from '../../contracts/storage';
import {
  ANNOUNCEMENT_AUDIENCE_ROLE_LABELS,
  ANNOUNCEMENT_SEVERITY_LABELS,
  AnnouncementAudienceRole,
  AnnouncementSeverity,
  COMMERCIAL_REQUEST_KIND_LABELS,
  COMMERCIAL_REQUEST_STATUS_LABELS,
  CommercialRequestStatus,
  COMMERCIAL_WORKSPACE_ROLE_LABELS,
  CommercialWorkspaceRole,
  OrganizationRole,
  SUBSCRIPTION_PLAN_LABELS,
  SubscriptionPlan,
  type CommercialRequest,
  type ProductAnnouncement,
} from '../../types';

interface AdminCommercialOpsViewProps {
  requests: CommercialRequest[];
  announcements: ProductAnnouncement[];
  loading: boolean;
  error: string | null;
  onUpdateRequest: (payload: CommercialRequestUpdatePayload) => Promise<void>;
  onUpsertAnnouncement: (payload: ProductAnnouncementUpsertPayload) => Promise<void>;
}

const PLAN_OPTIONS = [
  SubscriptionPlan.TOC_FREE,
  SubscriptionPlan.TOC_PAID,
  SubscriptionPlan.TOB_FREE,
  SubscriptionPlan.TOB_PAID,
];

const ROLE_OPTIONS = [
  AnnouncementAudienceRole.STUDENT,
  AnnouncementAudienceRole.INSTRUCTOR,
  AnnouncementAudienceRole.GROUP_ADMIN,
  AnnouncementAudienceRole.ADMIN,
];

const AdminCommercialOpsView: React.FC<AdminCommercialOpsViewProps> = ({
  requests,
  announcements,
  loading,
  error,
  onUpdateRequest,
  onUpsertAnnouncement,
}) => {
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(requests[0]?.id || null);
  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedRequestId) || requests[0] || null,
    [requests, selectedRequestId],
  );
  const [resolutionNote, setResolutionNote] = useState('');
  const [targetPlan, setTargetPlan] = useState<SubscriptionPlan>(SubscriptionPlan.TOB_FREE);
  const [targetOrgName, setTargetOrgName] = useState('');
  const [targetOrgRole, setTargetOrgRole] = useState<OrganizationRole>(OrganizationRole.GROUP_ADMIN);
  const [savingRequest, setSavingRequest] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<AnnouncementSeverity>(AnnouncementSeverity.UPDATE);
  const [selectedPlans, setSelectedPlans] = useState<SubscriptionPlan[]>([SubscriptionPlan.TOC_FREE]);
  const [selectedRoles, setSelectedRoles] = useState<AnnouncementAudienceRole[]>([AnnouncementAudienceRole.STUDENT]);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  useEffect(() => {
    if (requests.length === 0) {
      setSelectedRequestId(null);
      return;
    }

    if (!selectedRequestId || !requests.some((request) => request.id === selectedRequestId)) {
      setSelectedRequestId(requests[0].id);
    }
  }, [requests, selectedRequestId]);

  useEffect(() => {
    if (!selectedRequest) {
      setResolutionNote('');
      setTargetPlan(SubscriptionPlan.TOB_FREE);
      setTargetOrgName('');
      setTargetOrgRole(OrganizationRole.GROUP_ADMIN);
      return;
    }

    setResolutionNote(selectedRequest.resolutionNote || '');
    setTargetPlan(selectedRequest.targetSubscriptionPlan || SubscriptionPlan.TOB_FREE);
    setTargetOrgName(selectedRequest.targetOrganizationName || selectedRequest.organizationName || '');
    setTargetOrgRole(selectedRequest.targetOrganizationRole || OrganizationRole.GROUP_ADMIN);
  }, [selectedRequest]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Commercial Requests</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">導入・格上げキュー</h3>
          <div className="mt-5 space-y-3">
            {requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                申請はまだありません。
              </div>
            ) : (
              requests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => {
                    setSelectedRequestId(request.id);
                    setResolutionNote(request.resolutionNote || '');
                    setTargetPlan(request.targetSubscriptionPlan || SubscriptionPlan.TOB_FREE);
                    setTargetOrgName(request.targetOrganizationName || request.organizationName || '');
                    setTargetOrgRole(request.targetOrganizationRole || OrganizationRole.GROUP_ADMIN);
                  }}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                    selectedRequest?.id === request.id
                      ? 'border-medace-300 bg-medace-50'
                      : 'border-slate-200 bg-slate-50 hover:border-medace-200'
                  }`}
                  data-testid={`admin-commercial-request-${request.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-900">{COMMERCIAL_REQUEST_KIND_LABELS[request.kind]}</div>
                    <div className="text-xs font-bold text-medace-700">{COMMERCIAL_REQUEST_STATUS_LABELS[request.status]}</div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{request.contactName} / {request.contactEmail}</div>
                  <div className="mt-1 text-sm text-slate-500">{request.organizationName || '個人利用'} / {request.source}</div>
                </button>
              ))
            )}
          </div>

          {selectedRequest && (
            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <div className="text-lg font-black text-slate-950">{selectedRequest.contactName} さんの申請</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-700">{selectedRequest.message}</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="ui-form-label">反映プラン</label>
                  <select value={targetPlan} onChange={(event) => setTargetPlan(event.target.value as SubscriptionPlan)} className="ui-input mt-2">
                    {PLAN_OPTIONS.map((plan) => (
                      <option key={plan} value={plan}>{SUBSCRIPTION_PLAN_LABELS[plan]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ui-form-label">組織名</label>
                  <input value={targetOrgName} onChange={(event) => setTargetOrgName(event.target.value)} className="ui-input mt-2" placeholder="Steady Study Academy" />
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="ui-form-label">組織内ロール</label>
                  <select value={targetOrgRole} onChange={(event) => setTargetOrgRole(event.target.value as OrganizationRole)} className="ui-input mt-2">
                    {[
                      OrganizationRole.STUDENT,
                      OrganizationRole.INSTRUCTOR,
                      OrganizationRole.GROUP_ADMIN,
                    ].map((role) => (
                      <option key={role} value={role}>
                        {role === OrganizationRole.STUDENT ? COMMERCIAL_WORKSPACE_ROLE_LABELS[CommercialWorkspaceRole.STUDENT] : role === OrganizationRole.INSTRUCTOR ? COMMERCIAL_WORKSPACE_ROLE_LABELS[CommercialWorkspaceRole.INSTRUCTOR] : COMMERCIAL_WORKSPACE_ROLE_LABELS[CommercialWorkspaceRole.GROUP_ADMIN]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ui-form-label">対応メモ</label>
                  <input value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} className="ui-input mt-2" placeholder="初回案内を送付済み" />
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {[
                  CommercialRequestStatus.CONTACTED,
                  CommercialRequestStatus.APPROVED,
                  CommercialRequestStatus.PROVISIONED,
                  CommercialRequestStatus.DECLINED,
                ].map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={savingRequest}
                    onClick={async () => {
                      setSavingRequest(true);
                      try {
                        await onUpdateRequest({
                          id: selectedRequest.id,
                          status,
                          resolutionNote,
                          linkedUserUid: selectedRequest.linkedUserUid || selectedRequest.requestedByUid,
                          targetSubscriptionPlan: targetPlan,
                          targetOrganizationName: targetOrgName || undefined,
                          targetOrganizationRole: status === CommercialRequestStatus.PROVISIONED ? targetOrgRole : undefined,
                        });
                      } finally {
                        setSavingRequest(false);
                      }
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                  >
                    {COMMERCIAL_REQUEST_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Announcements</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">お知らせを配信する</h3>
            <div className="mt-5 space-y-4">
              <div>
                <label className="ui-form-label">タイトル</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="ui-input mt-2"
                  placeholder="重要アップデートのお知らせ"
                  data-testid="admin-announcement-title"
                />
              </div>
              <div>
                <label className="ui-form-label">本文</label>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="ui-input mt-2 min-h-[120px]"
                  placeholder="ユーザーに伝えたい変更点を記入"
                  data-testid="admin-announcement-body"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="ui-form-label">種別</label>
                  <select
                    value={severity}
                    onChange={(event) => setSeverity(event.target.value as AnnouncementSeverity)}
                    className="ui-input mt-2"
                    data-testid="admin-announcement-severity"
                  >
                    {Object.values(AnnouncementSeverity).map((option) => (
                      <option key={option} value={option}>{ANNOUNCEMENT_SEVERITY_LABELS[option]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ui-form-label">開始日時</label>
                  <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="ui-input mt-2" />
                </div>
                <div>
                  <label className="ui-form-label">終了日時</label>
                  <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="ui-input mt-2" />
                </div>
              </div>
              <div>
                <label className="ui-form-label">対象プラン</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PLAN_OPTIONS.map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setSelectedPlans((previous) => previous.includes(plan) ? previous.filter((item) => item !== plan) : [...previous, plan])}
                      className={`rounded-full border px-3 py-2 text-xs font-bold ${
                        selectedPlans.includes(plan)
                          ? 'border-medace-500 bg-medace-50 text-medace-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {SUBSCRIPTION_PLAN_LABELS[plan]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="ui-form-label">対象ユーザー</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelectedRoles((previous) => previous.includes(role) ? previous.filter((item) => item !== role) : [...previous, role])}
                      className={`rounded-full border px-3 py-2 text-xs font-bold ${
                        selectedRoles.includes(role)
                          ? 'border-medace-500 bg-medace-50 text-medace-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {ANNOUNCEMENT_AUDIENCE_ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                data-testid="admin-announcement-submit"
                disabled={savingAnnouncement}
                onClick={async () => {
                  setSavingAnnouncement(true);
                  try {
                    await onUpsertAnnouncement({
                      title,
                      body,
                      severity,
                      subscriptionPlans: selectedPlans,
                      audienceRoles: selectedRoles,
                      startsAt: startsAt ? new Date(startsAt).getTime() : undefined,
                      endsAt: endsAt ? new Date(endsAt).getTime() : undefined,
                    });
                    setTitle('');
                    setBody('');
                  } finally {
                    setSavingAnnouncement(false);
                  }
                }}
                className="rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-white"
              >
                {savingAnnouncement ? '保存中...' : 'お知らせを配信'}
              </button>
            </div>
          </div>

          <div className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
            <div className="text-base font-black text-slate-950">配信済みのお知らせ</div>
            <div className="mt-4 space-y-3">
              {announcements.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  まだお知らせはありません。
                </div>
              ) : (
                announcements.map((announcement) => (
                  <div key={announcement.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-bold text-slate-900">{announcement.title}</div>
                      <div className="text-xs font-bold text-medace-700">{ANNOUNCEMENT_SEVERITY_LABELS[announcement.severity]}</div>
                    </div>
                    <div className="mt-2 text-sm leading-relaxed text-slate-600">{announcement.body}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminCommercialOpsView;
