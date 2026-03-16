import { describe, expect, it } from 'vitest';

import {
  REACTIVATION_WINDOW_MS,
  getContinuityBand,
  getInstructorQueueSegment,
  resolveInterventionOutcome,
} from '../shared/retention';
import { InterventionOutcome, StudentRiskLevel } from '../types';

describe('retention helpers', () => {
  it('maps active study days into continuity bands', () => {
    expect(getContinuityBand(1)).toBe('LOW');
    expect(getContinuityBand(2)).toBe('BUILDING');
    expect(getContinuityBand(4)).toBe('STEADY');
  });

  it('resolves intervention outcomes from reactivation timing', () => {
    const now = REACTIVATION_WINDOW_MS + 1_000;

    expect(resolveInterventionOutcome({ latestInterventionAt: now - 1_000, now })).toBe(InterventionOutcome.PENDING);
    expect(resolveInterventionOutcome({ latestInterventionAt: now - 2_000, lastReactivatedAt: now - 1_500, now })).toBe(InterventionOutcome.REACTIVATED);
    expect(resolveInterventionOutcome({ latestInterventionAt: 1, now })).toBe(InterventionOutcome.EXPIRED);
  });

  it('segments instructor queues into immediate, waiting, and reactivated states', () => {
    expect(getInstructorQueueSegment({
      riskLevel: StudentRiskLevel.DANGER,
      needsFollowUpNow: true,
    })).toBe('IMMEDIATE');
    expect(getInstructorQueueSegment({
      riskLevel: StudentRiskLevel.WARNING,
      latestInterventionAt: Date.now(),
      latestInterventionOutcome: InterventionOutcome.PENDING,
      needsFollowUpNow: false,
    })).toBe('WAITING');
    expect(getInstructorQueueSegment({
      riskLevel: StudentRiskLevel.SAFE,
      latestInterventionAt: Date.now(),
      latestInterventionOutcome: InterventionOutcome.REACTIVATED,
      needsFollowUpNow: false,
    })).toBe('REACTIVATED');
  });
});
