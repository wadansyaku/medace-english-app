import { describe, expect, it } from 'vitest';

import { buildPrintableWorksheetHtml } from '../components/WorksheetPrintLauncher';
import { UserRole, type UserProfile } from '../types';
import type { GeneratedWorksheetQuestion } from '../utils/worksheet';

const user: UserProfile = {
  uid: 'teacher-1',
  displayName: '<script>teacher()</script>',
  role: UserRole.INSTRUCTOR,
  email: 'teacher@example.com',
};

const question: GeneratedWorksheetQuestion = {
  id: 'q1',
  mode: 'EN_WORD_ORDER',
  interactionType: 'ORDERING',
  wordId: 'word-1',
  bookId: 'book-1',
  bookTitle: 'Book',
  promptLabel: '英語語順',
  promptText: '<img src=x onerror=alert(1)>',
  answer: 'Doctors stabilize patients.',
  tokens: [
    { id: 't1', text: '<b>Doctors</b>' },
    { id: 't2', text: 'stabilize' },
    { id: 't3', text: 'patients.' },
  ],
  answerTokenIds: ['t1', 't2', 't3'],
  sourceSentence: '<script>alert(1)</script>',
};

describe('worksheet print html', () => {
  it('escapes dynamic worksheet content before writing it into srcDoc html', () => {
    const html = buildPrintableWorksheetHtml(
      user,
      undefined,
      {
        studentUid: 'student-1',
        studentName: '<img src=x onerror=student()>',
        organizationName: '<script>org()</script>',
        words: [
          {
            wordId: 'word-1',
            bookId: 'book-1',
            bookTitle: 'Book',
            word: 'stabilize',
            definition: '安定させる',
            status: 'review',
            lastStudiedAt: 1,
            attemptCount: 1,
            correctCount: 1,
          },
        ],
      },
      [question],
      'ANSWER_KEY',
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Doctors</b>');
    expect(html).toContain('&lt;script&gt;teacher()&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Doctors&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x onerror=student()&gt;');
  });
});
