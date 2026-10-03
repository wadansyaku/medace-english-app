import { exposeStudentDemo } from './smoke-support';
import type { Page } from '@playwright/test';
import { expect, test } from './diagnostics';
import { MOBILE_FLOW_TEST_IDS, maybeCompleteOnboarding, openDashboardReference, seedPhrasebook } from './smoke-support';
import type { QuizAttemptInput, QuizAttemptReceipt } from '../../shared/quizAttempt';

const prepareQuiz = async (page: Page) => {
  await page.goto('/');
  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  const imported = await seedPhrasebook(page, 'Quiz Receipt Synthetic');
  const bookId = imported.importedBookIds[0] as string;
  await page.reload();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await openDashboardReference(page, 'library');
  await page.getByTestId(`book-quiz-${bookId}`).click();
  await page.getByTestId('quiz-setup-primary-cta').click();
  await expect(page.getByTestId('quiz-running-view')).toBeVisible();
  return bookId;
};

const firstOption = (page: Page) => page.getByTestId('quiz-running-view').getByRole('button', { name: /トリアージ|安定させる/ }).first();

test.describe('quiz saved-answer reliability', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      // Synthetic app QA needs no external fonts/telemetry. An empty font CSS
      // avoids unresolved font loads during real-page screenshots.
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return route.abort();
    });
  });
  for (const viewport of [{width:390,height:844},{width:1280,height:900}]) {
    test(`lost response and rapid retry reuse one answer on ${viewport.width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await prepareQuiz(page);
      const answers: QuizAttemptInput[]=[];
      const receipts: QuizAttemptReceipt[]=[];
      await page.route('**/api/storage',async route=>{
        const body=route.request().postDataJSON();
        if(body?.action==='recordQuizAttempt') {
          answers.push(body.payload);
          if(answers.length===1) {
            const response=await route.fetch();
            expect(response.status()).toBe(200);
            receipts.push(await response.json());
            await route.abort('failed');return;
          }
          const response=await route.fetch();
          receipts.push(await response.json());
          await route.fulfill({response});return;
        }
        await route.continue();
      });
      await page.getByTestId('quiz-show-options').click();
      await firstOption(page).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
      await expect(page.getByTestId('quiz-save-error')).toContainText('保存を確認できませんでした');
      expect(answers).toHaveLength(1);expect(answers[0].clientAttemptId).toMatch(/^[a-zA-Z0-9_-]+$/);
      await page.screenshot({path:testInfo.outputPath(`quiz-save-retry-${viewport.width}.png`),fullPage:true});
      await page.getByTestId('quiz-save-retry').evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
      await expect(page.getByTestId('quiz-save-error')).toHaveCount(0);
      await expect(page.getByTestId('quiz-show-options')).toBeVisible();
      expect(answers).toHaveLength(2);expect(answers[1]).toEqual(answers[0]);expect(receipts[1]).toEqual(receipts[0]);
      await page.getByTestId('quiz-show-options').click();
      await firstOption(page).click();
      await expect(page.getByTestId('quiz-result-view')).toBeVisible();
      expect(answers).toHaveLength(3);expect(answers[2].clientAttemptId).not.toBe(answers[0].clientAttemptId);
      const expected=Number(answers[0].correct)+Number(answers[2].correct);
      await expect(page.getByTestId('quiz-result-view')).toContainText(`正解 ${expected} / 2`);
    });
  }
  test('a delayed save blocks exit until confirmed and does not advance a later quiz session',async({page})=>{
    await prepareQuiz(page);
    let release!:()=>void;
    let accepted!:()=>void;
    const serverAccepted=new Promise<void>(resolve=>{accepted=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/api/storage',async route=>{
      const body=route.request().postDataJSON();
      if(body?.action==='recordQuizAttempt') {
        const response=await route.fetch();expect(response.status()).toBe(200);accepted();
        await gate;await route.fulfill({response});return;
      }
      await route.continue();
    });
    await page.getByTestId('quiz-show-options').click();await firstOption(page).click();await serverAccepted;
    await page.getByTestId('quiz-back-button').click();
    await expect(page.getByTestId('quiz-exit-confirm')).toBeDisabled();
    await expect(page.getByTestId('quiz-exit-confirm-dialog')).toContainText('保存');
    release();
    await expect(page.getByTestId('quiz-exit-confirm')).toBeEnabled();
    await page.getByTestId('quiz-exit-confirm').click();
    await expect(page.getByTestId('quiz-setup-view')).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('quiz-setup-view')).toBeVisible();
    await expect(page.getByTestId('quiz-result-view')).toHaveCount(0);
  });
});
