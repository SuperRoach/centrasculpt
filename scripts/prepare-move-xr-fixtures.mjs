/** Native projects for physical-controller acceptance; generated files stay in ignored work/. */
import './compile-core.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
const directory='work/quest-move-fixtures';mkdirSync(directory,{recursive:true});
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2,2,3],target:[0,0,0]}};
for(const [label,n] of [['300k',114],['600k',160],['1m',192]]){
 const volume=new SDFVolume(n);if(label==='1m')for(let i=0;i<volume.values.length;i++)volume.values[i]-=.1;
 const project=createBaseProject(volume,settings);project.name=`Move XR test ${label}`;project.layerStack.layers[0].name=`Move test ${label}`;
 const buffer=saveSculptProject(project);openSculptProject(buffer);writeFileSync(`${directory}/move-xr-${label}.form`,new Uint8Array(buffer));console.log(`${label}: ${buffer.byteLength.toLocaleString()} bytes; native round-trip validated`);
}
writeFileSync(`${directory}/index.html`, `<!doctype html><html><head><meta charset="utf-8"><title>Move XR acceptance fixtures</title><style>body{font:20px system-ui;background:#252c2e;color:#eef5f3;margin:30px}a{display:block;color:#ccebdc;margin:20px;padding:18px;border:1px solid #96b5a5}p{max-width:900px}</style></head><body><h1>Move · real controller acceptance</h1><p>Download the one-million-vertex native project, then open it in a fresh sculpting tab. Existing open sculpture tabs remain available.</p><a href="move-xr-1m.form" download="move-xr-1m.form">Download 1,088,784-vertex project</a><a href="move-xr-600k.form" download="move-xr-600k.form">Download 603,072-vertex project</a><a href="move-xr-300k.form" download="move-xr-300k.form">Download 305,640-vertex project</a><a href="/" target="_blank" rel="noopener">Open fresh Centra Sculpt tab</a><p>Open .form → choose the downloaded file. Expand VR / WebXR Diagnostics and enable Show VR performance. Enter VR, choose Move from Support-stick Up, then test real Tool-trigger pulls. Release must restore the source. Compare first and subsequent pulls, inspect seams/normals, then test workspace grabs and tracking recovery.</p></body></html>`);
console.log('Quest URL: http://localhost:5173/work/quest-move-fixtures/index.html (existing USB forwarding required)');
