import React from 'react';
import {
  COMMERCIAL_REQUEST_KIND_LABELS,
  COMMERCIAL_REQUEST_STATUS_LABELS,
  type CommercialRequest,
} from '../../types';

interface CommercialRequestStatusListProps {
  requests: CommercialRequest[];
  emptyCopy: string;
}

const CommercialRequestStatusList: React.FC<CommercialRequestStatusListProps> = ({
  requests,
  emptyCopy,
}) => {
  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
        {emptyCopy}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="commercial-request-status-list">
      {requests.map((request) => (
        <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-bold text-slate-900">{COMMERCIAL_REQUEST_KIND_LABELS[request.kind]}</div>
            <div className="rounded-full border border-medace-200 bg-white px-3 py-1 text-xs font-bold text-medace-700">
              {COMMERCIAL_REQUEST_STATUS_LABELS[request.status]}
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-600">
            {request.organizationName ? `${request.organizationName} / ` : ''}
            {new Date(request.updatedAt).toLocaleString('ja-JP')}
          </div>
          <div className="mt-3 text-sm leading-relaxed text-slate-700">{request.message}</div>
          {request.resolutionNote && (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {request.resolutionNote}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CommercialRequestStatusList;
