// Real UI operations, fresh storage. No engine hooks or persistent user context.
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({viewport:{width:1600,height:1000}});
const page=await context.newPage();
page.setDefaultTimeout(15000);
const report=[];
const shot=async(name,caption)=>{await page.waitForTimeout(800);await page.screenshot({path:new URL(`screenshots/${name}.png`,import.meta.url).pathname});report.push({name,caption,width:1600,height:1000,url:page.url(),captured:new Date().toISOString()});};
const fill=async(locator,value)=>{await locator.fill(String(value));await locator.press('Tab');await page.waitForTimeout(150);};
try {
 if(!process.argv.includes('--enclosure-only')) {
 await page.goto('http://127.0.0.1:5261/',{waitUntil:'domcontentloaded'});
 await page.locator('#mesh-info').filter({hasText:'TRIANGLES'}).waitFor({timeout:90000});
 await page.getByRole('button',{name:'Hide Base',exact:true}).click();
 const primitive=page.locator('details').filter({has:page.locator(':scope > summary').filter({hasText:/^Primitives$/})}).first();
 await primitive.locator('summary').first().click();
 const create=async(name,w,h,d,x,y,z)=>{
  await primitive.getByRole('button',{name:'Create new',exact:true}).click();
  await primitive.getByRole('button',{name:'Box',exact:true}).click();
  for(const [key,value] of [['height',h],['depth',d],['width',w]]) await fill(primitive.getByLabel(`${key} (mm)`,{exact:true}),value);
  await primitive.getByRole('button',{name:'Create Box',exact:true}).click();await page.waitForTimeout(500);
  const createdDimensions=await primitive.locator('.primitive-bounds').innerText();
  if(!createdDimensions.includes(w.toFixed(2)+' × '+h.toFixed(2)+' × '+d.toFixed(2)))throw Error('Refused dimensions: '+createdDimensions);
  const rename=page.getByRole('textbox',{name:/^Rename Parametric box/}).last();await rename.fill(name);await rename.press('Enter');await page.waitForTimeout(150);
  const pose=primitive.locator('details.primitive-transform').first();
  if(!(await pose.evaluate(e=>e.open)))await pose.locator('summary').click();
  for(const [axis,value] of [['X',x],['Y',y],['Z',z]])await fill(primitive.getByLabel(`Primitive Position ${axis}`,{exact:true}),value);
  console.log(name, await primitive.locator('.primitive-bounds').innerText(), await primitive.locator('.primitive-transform').first().innerText(),await primitive.locator('.primitive-transform').first().locator('input').evaluateAll(es=>es.map(e=>e.value)));

 };
 await create('Body',90,20,40,0,13,0);
 await page.locator('#frame-selected').click();
 await shot('holder-body','Holder step 1: Body source, 90 × 20 × 40 mm at Y 13 mm.');
 await create('Base plate',110,16,50,0,4,0);
 await create('Left slot',8,22,14,-24,13,0);
 await create('Centre slot',8,22,14,0,13,0);
 await create('Right slot',8,22,14,24,13,0);
 await page.getByRole('button',{name:'Body',exact:true}).click();
 const boolean=page.locator('details').filter({has:page.locator(':scope > summary').filter({hasText:'Live Boolean Shapes'})}).first();
 await boolean.locator('summary').first().click();
 for(const [source,operation] of [['Base plate','Add / Union'],['Left slot','Subtract / Difference'],['Centre slot','Subtract / Difference'],['Right slot','Subtract / Difference']]){
  await boolean.getByLabel('Boolean source operand').selectOption({label:source});
  await boolean.getByRole('button',{name:operation,exact:true}).click();await page.waitForTimeout(800);
 }
 for(const name of ['Base plate','Left slot','Centre slot','Right slot'])await page.getByRole('button',{name:`Hide ${name}`,exact:true}).click();
 await page.locator('.preview-settings > summary').click();
 await page.locator('#composite-quality').selectOption('64');
 await page.locator('[data-surface-view="boolean"]').click();
 await page.waitForTimeout(7000);await page.locator('#frame-selected').click();
 await shot('holder-result','Holder step 3: evaluated body with one union and three differences, with operand roots hidden.');
 console.log('Holder:',await boolean.innerText());
 await page.locator('#open-export').click();
 await page.locator('#export-quality').selectOption('standard');
 await page.locator('#export-boolean').click();
 await page.locator('#export-download').waitFor({timeout:180000});
 console.log('Holder export:',await page.locator('#export-summary').innerText());
 await shot('holder-export','Prepared Unified Boolean STL for the tutorial holder. Review its evaluated XYZ dimensions and Print report before downloading.');

 // Reset only this disposable page, then create the enclosure through its actual preview/confirm controls.
 }
 await context.close();
 const c2=await browser.newContext({viewport:{width:1600,height:1000}});
 const p2=await c2.newPage();await p2.goto('http://127.0.0.1:5261/',{waitUntil:'domcontentloaded'});
 await p2.locator('#mesh-info').filter({hasText:'TRIANGLES'}).waitFor({timeout:90000});
 await p2.getByRole('button',{name:'Hide Base',exact:true}).click();
 const enclosure=p2.locator('.enclosure-panel');await enclosure.locator('summary').first().click();
 await enclosure.getByRole('button',{name:'Preview changes',exact:true}).click();
 await enclosure.getByRole('button',{name:'Create enclosure',exact:true}).click({timeout:90000});
 await p2.waitForTimeout(12000);
 await p2.locator('.preview-settings > summary').click();await p2.locator('#composite-quality').selectOption('64');
 await p2.locator('[data-surface-view="boolean"]').click();await p2.waitForTimeout(10000);
 await p2.locator('#frame-selected').click();
 await p2.screenshot({path:new URL('screenshots/enclosure-result.png',import.meta.url).pathname});
 report.push({name:'enclosure-result',caption:'Separate enclosure base and lid created through Preview changes → Create enclosure, using the tutorial dimensions.',width:1600,height:1000,url:p2.url(),captured:new Date().toISOString()});

 console.log('Enclosure:',await enclosure.innerText());
 await p2.getByRole('button',{name:'Enclosure Lid',exact:true}).click();
 const lidPrimitive=p2.locator('details').filter({has:p2.locator(':scope > summary').filter({hasText:/^Primitives$/})}).first();
 await lidPrimitive.locator('summary').first().click();await lidPrimitive.getByRole('button',{name:'Edit selected',exact:true}).click();
 await lidPrimitive.locator('details.primitive-transform').first().locator('summary').click();
 const lx=lidPrimitive.getByLabel('Primitive Position X',{exact:true});await lx.fill('45');await lx.press('Tab');
 await p2.waitForTimeout(6000);
 await p2.mouse.move(900,500);await p2.mouse.wheel(0,1150);await p2.waitForTimeout(800);
 await p2.mouse.move(820,500);await p2.mouse.down({button:'middle'});await p2.mouse.move(650,500,{steps:8});await p2.mouse.up({button:'middle'});await p2.waitForTimeout(800);
 await p2.screenshot({path:new URL('screenshots/enclosure-open.png',import.meta.url).pathname});
 report.push({name:'enclosure-open',caption:'The generated lid moved 45 mm along X for inspection. The base opening and lid lip remain separate editable components.',width:1600,height:1000,url:p2.url(),captured:new Date().toISOString()});
 await c2.close();
 const manifest=JSON.parse(await readFile(new URL('screenshots/manifest.json',import.meta.url)));
 await writeFile(new URL('screenshots/manifest.json',import.meta.url),JSON.stringify([...manifest.filter(x=>!report.some(y=>y.name===x.name)),...report],null,2)+'\n');
} finally {await browser.close();}
