import { describe, expect, it } from 'vitest';

import {
  EIKEN_WRITING_TASKS,
  countEssayWords,
  getDefaultEikenWritingTask,
  getEikenWritingLevelLabel,
  getEikenWritingTaskTypeLabel,
  getEikenWritingTasks,
  type EikenWritingLevel,
  type EikenWritingTaskType,
} from '../utils/eikenWritingPractice';

const LEVELS: EikenWritingLevel[] = ['grade-3', 'pre-2', 'grade-2', 'pre-1'];
const TASK_TYPES: EikenWritingTaskType[] = ['email', 'opinion', 'summary'];

describe('eiken writing practice seed data', () => {
  it('includes every target Eiken level and at least 24 original tasks', () => {
    expect(EIKEN_WRITING_TASKS.length).toBeGreaterThanOrEqual(24);

    for (const level of LEVELS) {
      expect(getEikenWritingTasks({ level }).length).toBeGreaterThan(0);
    }

    for (const taskType of TASK_TYPES) {
      expect(getEikenWritingTasks({ taskType }).length).toBeGreaterThan(0);
    }
  });

  it('provides multiple themes for every supported level and task-type pair', () => {
    const supportedPairs: Array<[EikenWritingLevel, EikenWritingTaskType]> = [
      ['grade-3', 'email'],
      ['grade-3', 'opinion'],
      ['pre-2', 'email'],
      ['pre-2', 'opinion'],
      ['pre-2', 'summary'],
      ['grade-2', 'opinion'],
      ['grade-2', 'summary'],
      ['pre-1', 'opinion'],
      ['pre-1', 'summary'],
    ];

    for (const [level, taskType] of supportedPairs) {
      expect(getEikenWritingTasks({ level, taskType }).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps ids unique and every task structurally usable for self-study', () => {
    const ids = new Set<string>();

    for (const task of EIKEN_WRITING_TASKS) {
      expect(ids.has(task.id)).toBe(false);
      ids.add(task.id);
      expect(task.titleJa).toBeTruthy();
      expect(task.promptEn).toBeTruthy();
      expect(task.promptJa).toBeTruthy();
      expect(task.wordRange.min).toBeGreaterThan(0);
      expect(task.wordRange.max).toBeGreaterThan(task.wordRange.min);
      expect(task.focusPoints.length).toBeGreaterThanOrEqual(3);
      expect(task.checklist.length).toBeGreaterThanOrEqual(3);
      expect(task.sourceInspiration).toMatch(/^[a-z0-9._:-]+$/);
      expect(task.promptEn).not.toContain('http');
      expect(task.promptJa).not.toContain('http');
    }
  });

  it('counts essay words even when punctuation, contractions, and hyphenated words are mixed in', () => {
    const essay = 'I’m studying English, math, and science. My teacher\'s e-mail advice helps a lot!';

    expect(countEssayWords(essay)).toBe(13);
    expect(countEssayWords('  First, I agree. Second: it saves time; however, it isn’t perfect.  ')).toBe(11);
    expect(countEssayWords('...')).toBe(0);
  });

  it('returns a default task that matches the requested filters', () => {
    expect(getDefaultEikenWritingTask({ level: 'pre-2' })).toMatchObject({
      level: 'pre-2',
    });
    expect(getDefaultEikenWritingTask({ taskType: 'summary' })).toMatchObject({
      taskType: 'summary',
    });
    expect(getDefaultEikenWritingTask({ level: 'grade-2', taskType: 'summary' })).toMatchObject({
      level: 'grade-2',
      taskType: 'summary',
    });
    expect(getDefaultEikenWritingTask({ level: 'grade-3', taskType: 'summary' })).toBeNull();
  });

  it('provides Japanese labels for levels and task types', () => {
    expect(getEikenWritingLevelLabel('grade-3')).toBe('英検3級');
    expect(getEikenWritingLevelLabel('pre-1')).toBe('英検準1級');
    expect(getEikenWritingTaskTypeLabel('email')).toBe('Eメール返信');
    expect(getEikenWritingTaskTypeLabel('summary')).toBe('要約');
  });
});
