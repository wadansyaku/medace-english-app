import React from 'react';
import {
  BellRing,
  Building2,
  Loader2,
  ShieldCheck,
  Users,
} from 'lucide-react';

import {
  OrganizationRole,
  SUBSCRIPTION_PLAN_LABELS,
  type OrganizationSettingsSnapshot,
} from '../../../types';
import type { BusinessAdminDashboardController } from './shared';
import { formatDateTime } from './shared';

interface BusinessAdminSettingsSectionProps {
  controller: BusinessAdminDashboardController;
  settingsSnapshot: OrganizationSettingsSnapshot;
}

const BusinessAdminSettingsSection: React.FC<BusinessAdminSettingsSectionProps> = ({
  controller,
  settingsSnapshot,
}) => (
  <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Building2 className="h-5 w-5 text-medace-600" />
        <div>
          <p className="text-xs font-bold text-slate-400">組織プロフィール</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">組織表示名を更新する</h3>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Organization ID</div>
          <div className="mt-2 text-sm font-medium text-slate-700">{settingsSnapshot.organizationId}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
          <label htmlFor="organization-settings-name-input" className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
            Display Name
          </label>
          <input
            id="organization-settings-name-input"
            data-testid="organization-settings-name-input"
            type="text"
            value={controller.organizationDisplayName}
            onChange={(event) => controller.setOrganizationDisplayName(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
          />
          <div className="mt-3 text-xs text-slate-500">`organization_id` は固定のまま、表示名だけ更新します。</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="organization-settings-save"
            onClick={() => void controller.handleOrganizationProfileSave()}
            disabled={controller.organizationSaving || controller.organizationDisplayName.trim() === ''}
            className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {controller.organizationSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            表示名を保存する
          </button>
          <div className="text-xs text-slate-500">
            最終更新: {formatDateTime(settingsSnapshot.updatedAt)}
          </div>
        </div>
      </div>
    </section>

    <section className="space-y-6">
      <div data-testid="organization-cohorts-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-medace-600" />
          <div>
            <p className="text-xs font-bold text-slate-400">クラス範囲</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">クラス/担当グループを管理する</h3>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
            <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">新しいクラス/担当グループ</label>
            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <input
                data-testid="cohort-create-input"
                type="text"
                value={controller.newCohortName}
                onChange={(event) => controller.setNewCohortName(event.target.value)}
                placeholder="例: 2026春 基礎クラス"
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
              />
              <button
                type="button"
                data-testid="cohort-create-submit"
                onClick={() => void controller.handleCohortSave()}
                disabled={controller.cohortSavingKey === 'new' || controller.newCohortName.trim() === ''}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800 disabled:opacity-60"
              >
                {controller.cohortSavingKey === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                追加する
              </button>
            </div>
          </div>

          {settingsSnapshot.cohorts.map((cohort) => (
            <div key={cohort.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                  <label htmlFor={`cohort-name-input-${cohort.id}`} className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                    クラス/担当グループ名
                  </label>
                  <input
                    id={`cohort-name-input-${cohort.id}`}
                    data-testid={`cohort-name-input-${cohort.id}`}
                    type="text"
                    value={controller.cohortDrafts[cohort.id] || ''}
                    onChange={(event) => controller.setCohortDraft(cohort.id, event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                  />
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{cohort.studentCount}名</span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">講師 {cohort.instructorCount}名</span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{formatDateTime(cohort.updatedAt)}</span>
                </div>
              </div>
              <button
                type="button"
                data-testid={`cohort-save-${cohort.id}`}
                onClick={() => void controller.handleCohortSave(cohort.id)}
                disabled={controller.cohortSavingKey === cohort.id || (controller.cohortDrafts[cohort.id] || '').trim() === ''}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-700 disabled:opacity-60"
              >
                {controller.cohortSavingKey === cohort.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                名前を保存する
              </button>
            </div>
          ))}

          {settingsSnapshot.cohorts.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-500">
              まだクラス/担当グループはありません。先に追加してから、生徒と講師の可視範囲を設定します。
            </div>
          )}
        </div>
      </div>

      <div data-testid="instructor-cohort-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-medace-600" />
          <div>
            <p className="text-xs font-bold text-slate-400">講師範囲</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">講師ごとの可視クラスを設定する</h3>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {settingsSnapshot.members
            .filter((member) => member.organizationRole === OrganizationRole.INSTRUCTOR)
            .map((member) => (
              <div key={member.userUid} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-950">{member.displayName}</div>
                    <div className="mt-1 text-xs text-slate-400">{member.email}</div>
                  </div>
                  <button
                    type="button"
                    data-testid={`instructor-cohort-save-${member.userUid}`}
                    onClick={() => void controller.handleInstructorCohortsSave(member.userUid)}
                    disabled={controller.instructorCohortSavingUid === member.userUid}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-700 disabled:opacity-60"
                  >
                    {controller.instructorCohortSavingUid === member.userUid ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    範囲を保存する
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {settingsSnapshot.cohorts.map((cohort) => {
                    const checked = (controller.instructorCohortDrafts[member.userUid] || []).includes(cohort.id);
                    return (
                      <label key={cohort.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                        <input
                          data-testid={`instructor-cohort-checkbox-${member.userUid}-${cohort.id}`}
                          type="checkbox"
                          checked={checked}
                          onChange={() => controller.toggleInstructorCohort(member.userUid, cohort.id)}
                          className="h-4 w-4 rounded border-slate-300 text-medace-600 focus:ring-medace-500"
                        />
                        <span className="font-medium">{cohort.name}</span>
                      </label>
                    );
                  })}
                </div>
                {settingsSnapshot.cohorts.length === 0 && (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                    先にクラス/担当グループを作成してください。
                  </div>
                )}
              </div>
            ))}
          {settingsSnapshot.members.every((member) => member.organizationRole !== OrganizationRole.INSTRUCTOR) && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-500">
              範囲設定対象の講師はまだいません。
            </div>
          )}
        </div>
      </div>

      <div data-testid="organization-members-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-medace-600" />
          <div>
            <p className="text-xs font-bold text-slate-400">メンバー</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">現メンバー一覧</h3>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {settingsSnapshot.members.map((member) => (
            <div key={member.userUid} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-950">{member.displayName}</div>
                  <div className="mt-1 text-xs text-slate-400">{member.email}</div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                  member.organizationRole === OrganizationRole.GROUP_ADMIN
                    ? 'border-medace-200 bg-medace-50 text-medace-800'
                    : member.organizationRole === OrganizationRole.INSTRUCTOR
                      ? 'border-sky-200 bg-sky-50 text-sky-700'
                      : 'border-slate-200 bg-white text-slate-600'
                }`}>
                  {member.organizationRole === OrganizationRole.GROUP_ADMIN ? '管理者' : member.organizationRole === OrganizationRole.INSTRUCTOR ? '講師' : '生徒'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{SUBSCRIPTION_PLAN_LABELS[member.subscriptionPlan]}</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{formatDateTime(member.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div data-testid="organization-audit-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <BellRing className="h-5 w-5 text-medace-600" />
          <div>
            <p className="text-xs font-bold text-slate-400">変更履歴</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">最近の監査履歴</h3>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {settingsSnapshot.auditEvents.length > 0 ? settingsSnapshot.auditEvents.map((event) => (
            <div key={`${event.id}-${event.createdAt}`} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-950">{event.actionType}</div>
                  <div className="mt-1 text-xs text-slate-500">{event.actorDisplayName}</div>
                </div>
                <div className="text-right text-xs text-slate-500">{formatDateTime(event.createdAt)}</div>
              </div>
              {event.payload && (
                <div className="mt-3 rounded-2xl border border-white bg-white px-4 py-3 text-xs leading-relaxed text-slate-600">
                  {Object.entries(event.payload).map(([key, value]) => `${key}: ${String(value)}`).join(' / ')}
                </div>
              )}
            </div>
          )) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-500">
              まだ監査イベントはありません。
            </div>
          )}
        </div>
      </div>
    </section>
  </div>
);

export default BusinessAdminSettingsSection;
