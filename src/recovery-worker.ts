import {sculptMask} from './sculpt-mask';
import {SDFVolume} from './sdf';
import {SdfLayer,LayerStack,SculptProject} from './layers';
import {saveSculptProject} from './project';
import {checksum} from './project-snapshot';
import type {ProjectSnapshot} from './project-snapshot';
/** Reuses the existing native validator/serializer. Termination discards all staging. */
self.onmessage=({data:d})=>{try{const start=performance.now(),s=d.snapshot as ProjectSnapshot,layers=s.layers.map(l=>{let first=true;const volume=new SDFVolume(l.resolution,l.extent,false,{dimensions:l.dimensions,latticeMin:l.latticeMin},n=>{if(first){first=false;return l.values;}return new Float32Array(n);});if(l.mask)sculptMask(volume).restore(l.mask);return new SdfLayer(volume,l.metadata);}),project=new SculptProject(new LayerStack(layers,s.activeLayerId),s.settings,s.name,s.id);project.displayPreferences=s.displayPreferences;project.toolPreferences=s.toolPreferences;const data=saveSculptProject(project),result={data,checksum:checksum(data),milliseconds:performance.now()-start};self.postMessage({id:d.id,result},{transfer:[data]});}catch(error){self.postMessage({id:d.id,error:error instanceof Error?error.message:String(error)});}};
