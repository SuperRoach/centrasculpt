// Disposable browser storage only; captures actual app UI without injected artwork.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
const context = await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const page = await context.newPage();
const records=[];
const shot=async(name,caption)=>{
 await page.waitForTimeout(600);
 await page.screenshot({path:new URL(`screenshots/${name}.png`,import.meta.url).pathname});
 records.push({name,caption,width:1600,height:1000,url:page.url(),captured:new Date().toISOString()});
};
try {
 await page.goto(process.env.CENTRA_CAPTURE_URL || 'http://127.0.0.1:5261/',{waitUntil:'domcontentloaded'});
 await page.locator('#mesh-info').filter({hasText:'TRIANGLES'}).waitFor({timeout:90000});
 await shot('workspace','Desktop workspace: brushes on the left, the starter sphere in the centre and Layers on the right.');
 await shot('clay-before','Before: the untouched 64³ starter sphere, with Add selected.');
 const canvas=page.locator('#viewport canvas').first();
 const box=await canvas.boundingBox();
 if(!box)throw Error('No viewport canvas');
 for(let i=0;i<12;i++) { await page.mouse.click(box.x+box.width*.53,box.y+box.height*.43,{delay:110}); await page.waitForTimeout(60); }
 console.log('After Add:',await page.locator('#history-info').innerText());
 await page.locator('#smooth').click();
 for(let i=0;i<3;i++) { await page.mouse.click(box.x+box.width*.53,box.y+box.height*.43,{delay:110}); await page.waitForTimeout(60); }
 await page.mouse.move(300,100);
 await page.waitForTimeout(700);
 const history=await page.locator('#history-info').innerText();console.log('Sculpt history:',history);
 if(!/^[1-9]/.test(history))throw Error('No committed clay edit; refusing an after capture.');
 await shot('clay-after','After: short repeated Add dabs followed by Smooth. The history records the real edits.');
 for(const [name,summary] of [['primitives','Primitives'],['precision','Measure & precision'],['enclosures','Enclosure'],['assemblies','Assembly']]){
   const target=page.locator('details').filter({has:page.locator(':scope > summary').filter({hasText:new RegExp(`^${summary}`)})}).first();
   await target.locator('summary').first().click();
   await target.scrollIntoViewIfNeeded();
   await shot(name,`${summary}: actual desktop controls in the current application.`);
   await target.locator('summary').first().click();
 }
 await page.locator('.primitive-panel').filter({has:page.locator('summary',{hasText:'Primitives'})}).first().locator('summary').first().click();
 await page.getByRole('button',{name:'Create Box',exact:true}).click();
 await page.waitForTimeout(1500);
 await page.getByText('Array / Repeat',{exact:true}).click();
 await page.getByText('Array / Repeat',{exact:true}).scrollIntoViewIfNeeded();
 await shot('arrays','Primitives → Array / Repeat: linear and radial repetition settings for the selected Box.');
 await page.getByText('Array / Repeat',{exact:true}).click();
 await page.getByRole('button',{name:'Create new',exact:true}).click();
 await page.getByRole('button',{name:'Box',exact:true}).click();
 await page.getByRole('button',{name:'Create Box',exact:true}).click();
 await page.waitForTimeout(1500);
 const boolean=page.locator('details').filter({has:page.locator(':scope > summary').filter({hasText:'Live Boolean Shapes'})}).first();
 await boolean.locator('summary').first().click();
 await boolean.scrollIntoViewIfNeeded();
 await shot('booleans','Live Boolean Shapes: choose another layer as an operand, then Add / Union, Subtract / Difference or Intersect.');
 await boolean.locator('summary').first().click();
 await page.locator('.layers-panel').evaluate(e=>e.scrollTop=0);
 await shot('layers','Layers retains the starter sculpt and two separately editable Box sources.');
 await page.getByRole('button',{name:'Save in Browser',exact:true}).click();
 await page.waitForTimeout(700);
 await page.getByRole('button',{name:'Project Library',exact:true}).click();
 await shot('library','Project Library in a fresh browser context, after saving this disposable demonstration.');
 await page.keyboard.press('Escape');
 await page.locator('#open-export').click();
 await page.locator('#export-advanced').evaluate(e=>e.open=true);
 await shot('export','Export dialog: file type, quality, Actual size (1:1) and optional experimental STL controls.');
 let previous=[];try {previous=JSON.parse(await readFile(new URL('screenshots/manifest.json',import.meta.url)));}catch {}
 await writeFile(new URL('screenshots/manifest.json',import.meta.url),JSON.stringify([...previous.filter(x=>!records.some(y=>y.name===x.name)),...records],null,2)+'\n');
 console.log(records);
} finally {await context.close();await browser.close();}
