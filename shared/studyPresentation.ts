/** Let a learner see the rating they accepted, including with reduced motion. */
export const STUDY_RATING_FEEDBACK_MIN_MS = 400;

export const getRemainingStudyRatingFeedbackMs = (acceptedAt: number, now = Date.now()): number => (
  Math.max(0, STUDY_RATING_FEEDBACK_MIN_MS - Math.max(0, now - acceptedAt))
);
