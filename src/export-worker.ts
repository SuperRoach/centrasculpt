import {encodeExport} from './glb-export';
import {ExportWork} from './export-mesh';
self.onmessage=async ({data:d})=>{
 try{const work=new ExportWork(new AbortController().signal,()=>true,p=>self.postMessage({id:d.id,progress:p})),result=await encodeExport(d.sources,d.quality,d.maxBytes,work);result.backend='worker';self.postMessage({id:d.id,result},{transfer:[result.data]});}
 catch(error){self.postMessage({id:d.id,error:error instanceof Error?error.message:String(error)});}
};
