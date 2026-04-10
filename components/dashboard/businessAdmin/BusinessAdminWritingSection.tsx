import React from 'react';

import type { UserProfile, WritingAssignment, WritingQueueItem } from '../../../types';
import { getBusinessAdminWritingCounts } from '../../../utils/businessAdminDashboard';
import WorkspaceMetricCard from '../../workspace/WorkspaceMetricCard';
import WritingOpsPanel from '../../WritingOpsPanel';

interface BusinessAdminWritingSectionProps {
  user: UserProfile;
  writingAssignments: WritingAssignment[];
  writingQueue: WritingQueueItem[];
}

const BusinessAdminWritingSection: React.FC<BusinessAdminWritingSectionProps> = ({
  user,
  writingAssignments,
  writingQueue,
}) => {
  const writingCounts = getBusinessAdminWritingCounts(writingAssignments, writingQueue);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorkspaceMetricCard label="配布済み" value={`${writingCounts.issuedCount}件`} detail="まだ提出されていない課題" />
        <WorkspaceMetricCard label="添削待ち" value={`${writingCounts.reviewReadyCount}件`} detail="講師確認待ちの提出" tone={writingCounts.reviewReadyCount > 0 ? 'warning' : 'success'} />
        <WorkspaceMetricCard label="再提出待ち" value={`${writingCounts.revisionRequestedCount}件`} detail="返却後の再提出待ち" tone={writingCounts.revisionRequestedCount > 0 ? 'warning' : 'default'} />
        <WorkspaceMetricCard label="完了済み" value={`${writingCounts.completedCount}件`} detail="返却と完了まで終了" />
      </div>
      <WritingOpsPanel user={user} />
    </div>
  );
};

export default BusinessAdminWritingSection;
