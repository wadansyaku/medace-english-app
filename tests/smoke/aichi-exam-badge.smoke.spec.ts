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
}
