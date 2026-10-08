import { expect,test } from './diagnostics';
// Controlled material metadata for UI regressions; native source matching is
// separately covered by the migration/API tests and original-source read-back.
for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1366,height:900}]){
 test(`Aichi word marker stays attached through flip, next word and revisit ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.route('**/api/guest-learning/naru',async route=>{
   const response=await route.fetch();const body=await response.json();
   body.words=body.words.map((word:any,index:number)=>({...word,aichiExamAppeared:index===0,definitionSupplemented:index===0}));
   await route.fulfill({response,json:body});
  });
  await page.goto('/start');await expect(page.getByTestId('guest-study-start')).toBeEnabled();
  await page.getByTestId('guest-study-start').click();
  const front=page.getByTestId('guest-card-front');const back=page.getByTestId('guest-card-back');
  await expect(front.getByTestId('aichi-exam-badge')).toBeVisible();
  await expect(front.getByTestId('aichi-exam-badge')).toHaveText('愛知県高校入試 出題済み');
  await expect(front.getByTestId('word-definition-supplement-note')).toHaveText('訳・例文訳：アプリ補完（辞書を参照）');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByTestId('guest-flip').click();
  await expect(back.getByTestId('aichi-exam-badge')).toBeVisible();
  await expect(back.getByTestId('word-definition-supplement-note')).toBeVisible();
  await page.getByRole('button',{name:'すぐ分かる',exact:true}).click();
  await expect(front.getByTestId('aichi-exam-badge')).toHaveCount(0);
  await expect(front.getByTestId('word-definition-supplement-note')).toHaveCount(0);
  await page.goto('/start');await expect(page.getByTestId('guest-study-start')).toBeEnabled();
  // A normal revisit skips already answered words. Explicit repeat is the
  // user's way to reopen the same original word rather than resume the queue.
  await page.getByRole('button',{name:'同じ範囲をもう一度学ぶ',exact:true}).click();
  await expect(front.getByTestId('aichi-exam-badge')).toBeVisible();
  await expect(front.getByTestId('word-definition-supplement-note')).toBeVisible();
 });

 test(`Corrected original definition labels only the supplemented example through flip, next and revisit ${viewport.width}x${viewport.height}`,async({page})=>{
  const definition='実際には';
  const exampleSentence="Actually, I don't like tomatoes.";
  const exampleMeaning='実は、私はトマトが好きではありません。';
  await page.setViewportSize(viewport);
  await page.route('**/api/guest-learning/naru',async route=>{
   const response=await route.fetch();const body=await response.json();
   // Controlled corrected-row contents and provenance flags exercise the UI.
   // Actual Excel/D1 source identity is checked separately without this fixture.
   body.words=body.words.map((word:any,index:number)=>index===0
    ? {...word,word:'actually',definition,exampleSentence,exampleMeaning,aichiExamAppeared:true,definitionSupplemented:false,exampleMeaningSupplemented:true}
    : {...word,aichiExamAppeared:false,definitionSupplemented:false,exampleMeaningSupplemented:false});
   await route.fulfill({response,json:body});
  });
  const assertNoOverflow=async()=>expect(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth))).toBe(0);
  await page.goto('/start');await expect(page.getByTestId('guest-study-start')).toBeEnabled();
  await page.getByTestId('guest-study-start').click();
  const front=page.getByTestId('guest-card-front');const back=page.getByTestId('guest-card-back');
  const assertCorrectedFront=async()=>{
   await expect(front.getByRole('heading',{name:'actually',exact:true})).toBeVisible();
   await expect(front.getByTestId('aichi-exam-badge')).toHaveText('愛知県高校入試 出題済み');
   await expect(front.getByTestId('word-example-meaning-supplement-note')).toBeVisible();
   await expect(front.getByTestId('word-example-meaning-supplement-note')).toHaveText('例文訳のみ：アプリ補完');
   await expect(front.getByTestId('word-definition-supplement-note')).toHaveCount(0);
   await assertNoOverflow();
  };
  const flipAndAssertCorrectedBack=async()=>{
   await page.getByTestId('guest-flip').click();
   await expect(back.getByTestId('word-example-meaning-supplement-note')).toBeVisible();
   await expect(back.getByTestId('word-example-meaning-supplement-note')).toHaveText('例文訳のみ：アプリ補完');
   await expect(back.getByTestId('word-definition-supplement-note')).toHaveCount(0);
   await expect(back.getByRole('heading',{name:definition,exact:true})).toBeVisible();
   await expect(back.locator('span[lang="en"]')).toHaveText('actually');
   const example=back.getByTestId('guest-saved-example');
   await expect(example.locator('p[lang="en"]')).toHaveText(exampleSentence);
   await expect(example.getByText(exampleMeaning,{exact:true})).toHaveCount(0);
   await example.getByRole('button',{name:'例文の訳を表示',exact:true}).click();
   await expect(example.getByText(exampleMeaning,{exact:true})).toBeVisible();
   await expect(back).not.toContainText('予想と違う事実・訂正');
   await expect(back).not.toContainText('実際に、本当に（事実の強調）');
   await expect(back).not.toContainText('辞書を参照');
   await assertNoOverflow();
  };
  await assertCorrectedFront();await flipAndAssertCorrectedBack();
  await page.getByRole('button',{name:'すぐ分かる',exact:true}).click();
  await expect(front.getByRole('heading')).not.toHaveText('actually');
  await expect(front.getByTestId('aichi-exam-badge')).toHaveCount(0);
  await expect(front.getByTestId('word-example-meaning-supplement-note')).toHaveCount(0);
  await expect(front.getByTestId('word-definition-supplement-note')).toHaveCount(0);
  await assertNoOverflow();
  await page.goto('/start');await expect(page.getByTestId('guest-study-start')).toBeEnabled();
  await page.getByRole('button',{name:'同じ範囲をもう一度学ぶ',exact:true}).click();
  await assertCorrectedFront();await flipAndAssertCorrectedBack();
 });
}
