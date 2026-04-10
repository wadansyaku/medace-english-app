import { useState } from 'react';

import { bootstrapDemoOrganization, type BootstrapDemoOrganizationResult } from '../../services/runtimeAdmin';

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

interface UseActivationBootstrapParams {
  refresh: () => Promise<void>;
  setNotice: (notice: NoticeState | null) => void;
}

const buildBootstrapMessage = (result: BootstrapDemoOrganizationResult): string => {
  if (result.createdCohort || result.createdMission || result.assignedMission) {
    return '導入セットを用意しました。次は最初のフォロー通知を送って、運用データを動かしてください。';
  }

  return '導入セットはすでに揃っています。次の運用アクションへ進んでください。';
};

export const useActivationBootstrap = ({
  refresh,
  setNotice,
}: UseActivationBootstrapParams) => {
  const [bootstrapPending, setBootstrapPending] = useState(false);

  const handleActivationBootstrap = async (): Promise<BootstrapDemoOrganizationResult | null> => {
    setBootstrapPending(true);
    try {
      const result = await bootstrapDemoOrganization();
      await refresh();
      setNotice({
        tone: 'success',
        message: buildBootstrapMessage(result),
      });
      return result;
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : '導入セットの準備に失敗しました。',
      });
      return null;
    } finally {
      setBootstrapPending(false);
    }
  };

  return {
    bootstrapPending,
    handleActivationBootstrap,
  };
};

export default useActivationBootstrap;
