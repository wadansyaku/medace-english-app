import { describe, expect, it } from 'vitest';

import { buildPrintableAssignmentHtml } from '../components/WritingPrintLauncher';
import {
  WritingAssignmentStatus,
  WritingExamCategory,
  type WritingAssignment,
} from '../types';

describe('writing assignment printable HTML security', () => {
  it('escapes every dynamic text value before opening the printable blob document', () => {
    const scriptInjection = `<script>alert("student" & 'peer')</script>`;
    const imageInjection = `<img src=x onerror="alert('image')">`;
    const svgInjection = `<svg onload="alert('prompt')"></svg>`;
    const assignment: WritingAssignment = {
      id: scriptInjection,
      organizationId: 'org-1',
      organizationName: imageInjection,
      instructorUid: 'instructor-1',
      instructorName: `"Instructor" & 'Coach' ${svgInjection}`,
      studentUid: 'student-1',
      studentName: scriptInjection,
      examCategory: WritingExamCategory.EIKEN,
      templateId: 'template-1',
      templateType: 'OPINION',
      promptTitle: `<b title="topic">${imageInjection}</b>`,
      promptText: svgInjection,
      guidance: `Use "quotes" & 'apostrophes' ${scriptInjection}`,
      wordCountMin: 50,
      wordCountMax: 60,
      submissionCode: imageInjection,
      status: WritingAssignmentStatus.ISSUED,
      attemptCount: 0,
      maxAttempts: 2,
      createdAt: 100,
      issuedAt: 110,
      updatedAt: 110,
    };

    const html = buildPrintableAssignmentHtml(assignment);

    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<svg\s+onload=/i);
    expect(html).not.toContain('onerror="');
    expect(html).toContain('&lt;script&gt;alert(&quot;student&quot; &amp; &#39;peer&#39;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(&#39;image&#39;)&quot;&gt;');
    expect(html).toContain('&lt;svg onload=&quot;alert(&#39;prompt&#39;)&quot;&gt;&lt;/svg&gt;');
    expect(html).toContain('&quot;Instructor&quot; &amp; &#39;Coach&#39;');
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  });
});
