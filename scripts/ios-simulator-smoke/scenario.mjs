import {
  MOBILE_FLOW_BUTTON_LABELS,
  MOBILE_FLOW_SCENARIOS,
  MOBILE_FLOW_TEST_IDS,
  MOBILE_FLOW_WRITING,
} from '../../config/mobileFlow.js';

export const createScenarioRunner = ({
  appUrl,
  screenshotPath,
  writingFeedbackScreenshotPath,
  runCommand,
  sleep,
  webdriverClient,
}) => {
  const {
    webdriver,
    execute,
    apiRequest,
    serverRequest,
    waitFor,
    isVisibleByTestId,
    clickByTestId,
    clickFirstBySelector,
    clickVisibleButtonContaining,
    waitForVisibleText,
    setFileInputByTestId,
    setTextareaByPlaceholder,
    loginDemoViaApi,
    createServerSession,
    getSessionUser,
    waitForEither,
  } = webdriverClient;

  const maybeCompleteOnboarding = async (sessionId) => {
    const landingState = await waitForEither(sessionId, [
      MOBILE_FLOW_TEST_IDS.studentDashboard,
      MOBILE_FLOW_TEST_IDS.onboardingProfile,
    ], 12000);
    if (landingState === MOBILE_FLOW_TEST_IDS.studentDashboard) return;

    await clickVisibleButtonContaining(sessionId, MOBILE_FLOW_BUTTON_LABELS.onboardingGrade);
    await clickVisibleButtonContaining(sessionId, MOBILE_FLOW_BUTTON_LABELS.onboardingConfidence);
    await clickVisibleButtonContaining(sessionId, MOBILE_FLOW_BUTTON_LABELS.onboardingStart);

    await waitFor(MOBILE_FLOW_SCENARIOS.onboarding, async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.onboardingTest);
      return state?.visible ? state : null;
    });

    for (let index = 0; index < 12; index += 1) {
      await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.diagnosticOption);
      await sleep(150);
      if (index === 11) {
        await clickVisibleButtonContaining(sessionId, MOBILE_FLOW_BUTTON_LABELS.onboardingResult);
      } else {
        await clickVisibleButtonContaining(sessionId, MOBILE_FLOW_BUTTON_LABELS.onboardingNext);
      }
    }

    await waitFor('onboarding result', async () => {
      const state = await isVisibleByTestId(sessionId, 'onboarding-result');
      return state?.visible ? state : null;
    });

    await clickVisibleButtonContaining(sessionId, MOBILE_FLOW_BUTTON_LABELS.onboardingCommit);
  };

  const verifyPrimaryCta = async (sessionId) => {
    const result = await waitFor(MOBILE_FLOW_SCENARIOS.dashboardCta, () => execute(sessionId, `
      const target = document.querySelector('[data-testid="${MOBILE_FLOW_TEST_IDS.studentHeroPrimaryCta}"]');
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return {
        text: (target.innerText || target.textContent || '').trim(),
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
        insideViewport: rect.bottom <= window.innerHeight,
      };
    `), 12000);

    if (!result.insideViewport) {
      throw new Error(`Primary CTA fell below the first viewport: ${JSON.stringify(result)}`);
    }

    return result;
  };

  const seedPhrasebook = async (sessionId, title) => {
    const response = await execute(sessionId, `
      const bookTitle = arguments[0];
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/storage', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        action: 'batchImportWords',
        payload: {
          defaultBookName: bookTitle,
          source: {
            kind: 'rows',
            rows: [
              { bookName: bookTitle, number: 1, word: 'triage', definition: 'トリアージ' },
              { bookName: bookTitle, number: 2, word: 'stabilize', definition: '安定させる' },
            ],
          },
        },
      }));

      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch (error) {
        data = { parseError: String(error), raw: xhr.responseText };
      }

      return {
        ok: xhr.status >= 200 && xhr.status < 300,
        httpStatus: xhr.status,
        data,
      };
    `, [title]);

    if (!response.ok) {
      throw new Error(`Failed to seed phrasebook: ${JSON.stringify(response)}`);
    }

    return response.data;
  };

  const answerSeededQuizQuestion = async (sessionId) => {
    const prompt = await execute(sessionId, `
      const element = document.querySelector('[data-testid="${MOBILE_FLOW_TEST_IDS.quizQuestionCard}"]');
      return (element?.innerText || element?.textContent || '').trim();
    `);
    const answer = String(prompt).includes('triage') ? 'トリアージ' : '安定させる';
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizShowOptions);
    await clickVisibleButtonContaining(sessionId, answer);
  };

  const seedReturnedWritingFeedback = async (adminCookie, studentUid) => {
    const templatesResponse = await serverRequest('GET', '/api/writing/templates', null, {
      cookie: adminCookie,
    });
    const templateId = templatesResponse.data?.templates?.[0]?.id;
    if (!templatesResponse.ok || !templateId) {
      throw new Error(`Could not load writing templates: ${JSON.stringify(templatesResponse)}`);
    }

    const generated = await serverRequest('POST', '/api/writing/assignments/generate', {
      studentUid,
      templateId,
      topicHint: 'tablets for classroom learning',
    }, {
      cookie: adminCookie,
    });
    const assignmentId = generated.data?.id;
    if (!generated.ok || !assignmentId) {
      throw new Error(`Could not generate assignment: ${JSON.stringify(generated)}`);
    }

    const issued = await serverRequest('POST', '/api/writing/assignments/issue', { assignmentId }, {
      cookie: adminCookie,
    });
    if (!issued.ok) {
      throw new Error(`Could not issue assignment: ${JSON.stringify(issued)}`);
    }

    return assignmentId;
  };

  const submitBusinessWritingAttempt = async (sessionId, assignmentId) => {
    await webdriver('POST', `/session/${sessionId}/url`, { url: appUrl });
    await maybeCompleteOnboarding(sessionId);

    await waitFor(MOBILE_FLOW_SCENARIOS.writingSubmit, async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.writingStudentSection);
      return state?.visible ? state : null;
    }, 20000);

    await clickFirstBySelector(sessionId, `[data-testid="writing-open-submit-${assignmentId}"]`);
    await waitForVisibleText(sessionId, MOBILE_FLOW_BUTTON_LABELS.writingNextToFiles);
    await clickVisibleButtonContaining(sessionId, MOBILE_FLOW_BUTTON_LABELS.writingNextToFiles);
    await waitFor('writing file input', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.writingStudentFileInput);
      return state?.visible ? state : null;
    });
    await setFileInputByTestId(
      sessionId,
      MOBILE_FLOW_TEST_IDS.writingStudentFileInput,
      'ios-writing-attempt.png',
      'image/png',
      'ios simulator writing attempt',
    );
    await clickVisibleButtonContaining(sessionId, MOBILE_FLOW_BUTTON_LABELS.writingNextToSubmit);
    await setTextareaByPlaceholder(
      sessionId,
      MOBILE_FLOW_WRITING.transcriptPlaceholder,
      'Students should use tablets because they can review lessons quickly and share notes with classmates after class.',
    );
    await clickByTestId(sessionId, 'writing-submit-upload');
    await waitForVisibleText(sessionId, MOBILE_FLOW_BUTTON_LABELS.writingSubmitted);

    const latestAssignment = await waitFor('submitted writing assignment status', async () => {
      const response = await apiRequest(sessionId, 'GET', '/api/writing/assignments?scope=mine');
      if (!response.ok) return null;
      return response.data?.assignments?.find((assignment) => (
        assignment.id === assignmentId
        && ['SUBMITTED', 'REVIEW_READY', 'RETURNED', 'REVISION_REQUESTED', 'COMPLETED'].includes(assignment.status)
      )) || null;
    }, 20000);

    return latestAssignment.id;
  };

  const findReviewQueueSubmissionId = async (adminCookie, assignmentId) => waitFor('review queue submission id', async () => {
    const response = await serverRequest('GET', '/api/writing/review-queue?scope=QUEUE', null, {
      cookie: adminCookie,
    });
    if (!response.ok) return null;
    const queueItem = response.data?.items?.find((item) => item.assignmentId === assignmentId);
    return queueItem?.submissionId || null;
  }, 20000);

  const waitForReturnedAssignment = async (sessionId, assignmentId) => waitFor('returned writing assignment', async () => {
    const response = await apiRequest(sessionId, 'GET', '/api/writing/assignments?scope=mine');
    if (!response.ok) return null;
    const assignment = response.data?.assignments?.find((item) => item.id === assignmentId);
    if (!assignment?.latestSubmissionId) return null;
    if (!['RETURNED', 'REVISION_REQUESTED', 'COMPLETED'].includes(assignment.status)) return null;
    return assignment;
  }, 20000);

  const approveReturnedWritingFeedback = async (adminCookie, submissionId) => {
    const detail = await serverRequest('GET', `/api/writing/submissions/${submissionId}`, null, {
      cookie: adminCookie,
    });
    const selectedEvaluationId = detail.data?.submission?.evaluations?.[0]?.id;
    if (!detail.ok || !selectedEvaluationId) {
      throw new Error(`Could not load submission detail: ${JSON.stringify(detail)}`);
    }

    const approved = await serverRequest('POST', `/api/writing/submissions/${submissionId}/approve-return`, {
      selectedEvaluationId,
      publicComment: '理由の流れは伝わっています。次は語彙の選び方をもう一段広げましょう。',
    }, {
      cookie: adminCookie,
    });
    if (!approved.ok) {
      throw new Error(`Could not approve returned writing feedback: ${JSON.stringify(approved)}`);
    }
  };

  const verifyBusinessFeedbackView = async (sessionId, assignmentId) => {
    await webdriver('POST', `/session/${sessionId}/url`, { url: appUrl });
    await maybeCompleteOnboarding(sessionId);

    await waitFor(MOBILE_FLOW_SCENARIOS.writingFeedback, async () => {
      const state = await execute(sessionId, `
        const assignmentId = arguments[0];
        const button = document.querySelector(\`[data-testid="writing-open-feedback-\${assignmentId}"]\`);
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? { top: rect.top, bottom: rect.bottom } : null;
      `, [assignmentId]);
      return state;
    }, 20000);

    await clickFirstBySelector(sessionId, `[data-testid="writing-open-feedback-${assignmentId}"]`);
    await waitFor('writing feedback mobile view', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.writingFeedbackMobileView);
      return state?.visible ? state : null;
    }, 15000);

    const sectionOrder = await execute(sessionId, `
      const selectors = arguments[0];
      return selectors.map((selector) => {
        const element = document.querySelector(\`[data-testid="\${selector}"]\`);
        if (!element) return { selector, top: null };
        return { selector, top: element.getBoundingClientRect().top };
      });
    `, [MOBILE_FLOW_WRITING.feedbackSectionOrder]);
    const validTops = sectionOrder.map((item) => item.top).filter((value) => typeof value === 'number');
    if (validTops.length !== MOBILE_FLOW_WRITING.feedbackSectionOrder.length
      || validTops.some((value, index) => index > 0 && value < validTops[index - 1])) {
      throw new Error(`Writing feedback sections were not laid out in a single column: ${JSON.stringify(sectionOrder)}`);
    }

    await runCommand('xcrun', ['simctl', 'io', 'booted', 'screenshot', writingFeedbackScreenshotPath]);
    console.log(`Saved simulator screenshot: ${writingFeedbackScreenshotPath}`);
  };

  const runFlow = async (sessionId) => {
    await waitFor(MOBILE_FLOW_SCENARIOS.demoLogin, async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.demoLoginStudent);
      return state?.visible ? state : null;
    }, 20000);

    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.demoLoginStudent);
    await maybeCompleteOnboarding(sessionId);

    await waitFor('student dashboard', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studentDashboard);
      return state?.visible ? state : null;
    }, 20000);
    await waitFor('mobile demo banner toggle', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.demoBannerToggle);
      return state?.visible ? state : null;
    }, 12000);

    const ctaMetrics = await verifyPrimaryCta(sessionId);
    console.log(`Verified primary CTA in first viewport: ${ctaMetrics.text}`);

    const importResult = await seedPhrasebook(sessionId, 'iOS Appium Mobile Drill');
    const bookId = importResult.importedBookIds?.[0];
    if (!bookId) {
      throw new Error(`Seeded phrasebook did not return a book id: ${JSON.stringify(importResult)}`);
    }

    await webdriver('POST', `/session/${sessionId}/url`, { url: appUrl });
    await waitFor('student dashboard after reload', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studentDashboard);
      return state?.visible ? state : null;
    }, 20000);

    await clickByTestId(sessionId, `book-quiz-${bookId}`);
    await waitFor('quiz setup view', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizSetupView);
      return state?.visible ? state : null;
    }, 15000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizSelectionLearnedOnly);
    await waitFor('quiz learned empty state', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizEmptyState);
      return state?.visible ? state : null;
    }, 12000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizBackButton);
    await waitFor('student dashboard after quiz back', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studentDashboard);
      return state?.visible ? state : null;
    }, 15000);

    await clickByTestId(sessionId, `book-study-${bookId}`);
    await waitFor(MOBILE_FLOW_SCENARIOS.study, async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyCardFront);
      return state?.visible && state.ariaHidden !== 'true' ? state : null;
    }, 15000);

    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyFlipButton);
    await waitFor('study card back', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyCardBack);
      if (!state?.visible) return null;
      return state.ariaHidden === 'false' ? state : null;
    }, 15000);

    await waitFor('rating buttons', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyRate0);
      return state?.visible ? state : null;
    }, 15000);

    await execute(sessionId, `
      const element = document.querySelector('[data-testid="${MOBILE_FLOW_TEST_IDS.studyCardBack}"]');
      if (element) {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      return Boolean(element);
    `);
    await sleep(400);
    await runCommand('xcrun', ['simctl', 'io', 'booted', 'screenshot', screenshotPath]);
    console.log(`Saved simulator screenshot: ${screenshotPath}`);

    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyRate3);
    await waitFor('second study card front', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyCardFront);
      return state?.visible && state.ariaHidden !== 'true' ? state : null;
    }, 15000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyFlipButton);
    await waitFor('second rating buttons', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyRate3);
      return state?.visible ? state : null;
    }, 15000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyRate3);
    await waitFor('study finish button', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyFinishExit);
      return state?.visible ? state : null;
    }, 15000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studyFinishExit);
    await waitFor('student dashboard after study finish', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.studentDashboard);
      return state?.visible ? state : null;
    }, 15000);

    await clickByTestId(sessionId, `book-quiz-${bookId}`);
    await waitFor('quiz setup view after study', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizSetupView);
      return state?.visible ? state : null;
    }, 15000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizSelectionLearnedOnly);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizSetupPrimaryCta);
    await waitFor('quiz ready view', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizReadyView);
      return state?.visible ? state : null;
    }, 15000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizReadyStart);
    await waitFor('quiz running view', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizRunningView);
      return state?.visible ? state : null;
    }, 15000);

    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizBackButton);
    await waitFor(MOBILE_FLOW_SCENARIOS.quizExitConfirm, async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizExitConfirmDialog);
      return state?.visible ? state : null;
    }, 12000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizExitCancel);
    await waitFor('quiz running view after cancel', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizRunningView);
      return state?.visible ? state : null;
    }, 12000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizBackButton);
    await waitFor('quiz exit confirm dialog again', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizExitConfirmDialog);
      return state?.visible ? state : null;
    }, 12000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizExitConfirm);
    await waitFor('quiz setup view after confirm', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizSetupView);
      return state?.visible ? state : null;
    }, 12000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizSetupPrimaryCta);
    await waitFor('quiz ready view rerun', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizReadyView);
      return state?.visible ? state : null;
    }, 12000);
    await clickByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizReadyStart);
    await waitFor('quiz running view rerun', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizRunningView);
      return state?.visible ? state : null;
    }, 12000);
    await answerSeededQuizQuestion(sessionId);
    await waitFor('second quiz question', async () => {
      const state = await execute(sessionId, `
        const root = document.querySelector('[data-testid="${MOBILE_FLOW_TEST_IDS.quizRunningView}"]');
        return root ? root.innerText.includes('第 2 問') : false;
      `);
      return state ? { ok: true } : null;
    }, 12000);
    await answerSeededQuizQuestion(sessionId);
    await waitFor('quiz result view', async () => {
      const state = await isVisibleByTestId(sessionId, MOBILE_FLOW_TEST_IDS.quizResultView);
      return state?.visible ? state : null;
    }, 15000);

    await loginDemoViaApi(sessionId, 'STUDENT', 'STUDENT');
    await webdriver('POST', `/session/${sessionId}/url`, { url: appUrl });
    await maybeCompleteOnboarding(sessionId);
    const businessStudentSession = await getSessionUser(sessionId);
    const adminSession = await createServerSession('INSTRUCTOR', 'GROUP_ADMIN');
    const assignmentId = await seedReturnedWritingFeedback(adminSession.cookie, businessStudentSession.uid);
    await submitBusinessWritingAttempt(sessionId, assignmentId);
    const submissionId = await findReviewQueueSubmissionId(adminSession.cookie, assignmentId);
    await approveReturnedWritingFeedback(adminSession.cookie, submissionId);
    await waitForReturnedAssignment(sessionId, assignmentId);
    await verifyBusinessFeedbackView(sessionId, assignmentId);
  };

  return {
    runFlow,
  };
};

export default createScenarioRunner;
