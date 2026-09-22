/* eslint-disable @typescript-eslint/no-require-imports */
// Visual acceptance checks use the real UI with synthetic transport fixtures.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const root = process.cwd();
const dir = path.join(root, 'out/mobile-check');
const server = http.createServer((req,res)=>{
  const name = new URL(req.url,'http://localhost').pathname;
  const file = name === '/fonts/manrope.ttf' ? path.join(root,'public/fonts/manrope.ttf') : ['/', '/index.html', '/bundle.js', '/bundle.css', '/styles.css'].includes(name) ? path.join(dir, name === '/' ? 'index.html' : name) : null;
  if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.ttf')?'font/ttf':'text/html');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch();
 try {
  for(const theme of ['dark','light']) for(const width of [375,768,1440]) for(const route of ['dashboard','todos','calendar','assistant','friends','profile']) {
   const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/?page=${route}`);
   await page.waitForTimeout(300);
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForTimeout(200);
   assert.deepEqual(errors,[],`${route}: runtime errors before visual checks`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,`${route} ${width} ${theme} overflow`);
   await page.evaluate(()=>document.fonts.load('14px Manrope'));
   assert.equal(await page.evaluate(()=>document.fonts.check('14px Manrope')),true,`${route}: Manrope loaded`);
   if(route==='calendar') {
    const slot=page.locator('.calendar-slot[data-time="12:00:00"]').first();
    await slot.evaluate(el => el.scrollIntoView({block:'center'}));
    const box = await slot.boundingBox();
    // FullCalendar's interactive day column sits over the background slot lane.
    await page.mouse.click(box.x + Math.min(100, box.width / 2), box.y + 8);
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByLabel('Start',{exact:true}).inputValue(),/T12:00$/);
    assert.match(await page.getByLabel('End',{exact:true}).inputValue(),/T13:00$/);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(),0);
   }
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:path.join(dir,`figma-${route}-${width}-${theme}.png`),fullPage:true});
   assert.deepEqual(errors,[]);
   if(route==='dashboard'&&width===1440) console.log(theme, await page.locator('.proof-pill').first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,raised:getComputedStyle(el).getPropertyValue('--raised')})));
   await page.close();
  }
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/?page=dashboard`);
  await page.getByRole('button',{name:'Switch to light mode'}).first().click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('dailyproof.theme')),'light');
  await page.close();
  console.log('36 visual checks passed; real Manrope, both themes, slot prefill, Escape, and theme storage verified. More is server-rendered with synthetic data.');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
