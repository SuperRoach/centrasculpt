/** Bounded compressed source assets. Never geometry, history or controller ray children. */
export const REFERENCE_LIMITS={count:6,fileBytes:6*1024**2,totalBytes:12*1024**2,dimension:4096,pixels:8_800_000};
export type ReferenceImage={id:string;name:string;bytes:Uint8Array;mime:'image/png'|'image/jpeg';width:number;height:number;space:'workspace'|'sculpture';position:[number,number,number];rotation:[number,number,number];size:number;opacity:number;visible:boolean;locked:boolean;twoSided:boolean;flipX?:boolean};
/** Desktop filenames are checked separately from native reference display names. */
export function validateReferenceFileName(name:string,mime?:ReferenceImage['mime']):void{
 const extension=name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
 if(!extension||!['png','jpg','jpeg'].includes(extension))throw new Error(`“${name}” ${extension?`has an unsupported .${extension} extension`:'has no image file extension'}. Choose a .png, .jpg or .jpeg file.`);
 if(mime&&(extension==='png'?'image/png':'image/jpeg')!==mime)throw new Error(`“${name}” has a .${extension} extension, but its contents are ${mime==='image/png'?'PNG':'JPEG'}. Use ${mime==='image/png'?'.png':'.jpg or .jpeg'} for this image.`);
}
export function imageHeader(bytes:Uint8Array):{mime:ReferenceImage['mime'];width:number;height:number}{
 if(bytes.length<24||bytes.length>REFERENCE_LIMITS.fileBytes)throw new Error('Reference must be a PNG/JPEG up to 6 MiB.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0,mime:ReferenceImage['mime'];
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)){
  if(v.getUint32(8)!==13||v.getUint32(12)!==0x49484452)throw new Error('Invalid PNG header.');
  mime='image/png';width=v.getUint32(16);height=v.getUint32(20);
  let offset=8,ended=false;while(offset+12<=bytes.length){const length=v.getUint32(offset),type=v.getUint32(offset+4);if(type===0x49484452&&offset!==8)throw new Error('Repeated PNG image header.');if(length>bytes.length-offset-12)throw new Error('Truncated PNG.');if(type===0x6163544c)throw new Error('Animated PNG is unsupported.');offset+=12+length;if(type===0x49454e44){ended=true;break;}}
  if(!ended||offset!==bytes.length)throw new Error('Invalid PNG end.');
 }else if(bytes[0]===255&&bytes[1]===216){
  if(bytes.at(-2)!==255||bytes.at(-1)!==217)throw new Error('Invalid JPEG end.');
  mime='image/jpeg';let p=2;
  while(p+4<=bytes.length){if(bytes[p++]!==255)throw new Error('Invalid JPEG marker.');while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===0xda||marker===0xd9)break;const length=v.getUint16(p);if(length<2||p+length>bytes.length)throw new Error('Truncated JPEG.');
   if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)throw new Error('Invalid JPEG frame.');height=v.getUint16(p+3);width=v.getUint16(p+5);if(p+length+4<=bytes.length){let q=p+length;while(q+4<=bytes.length&&bytes[q]===255){const m=bytes[q+1];if(m===0xda||m===0xd9)break;const n=v.getUint16(q+2);if([0xc0,0xc1,0xc2].includes(m)||n<2||q+2+n>bytes.length)throw new Error('Invalid or repeated JPEG frame.');q+=2+n;}}break;}p+=length;
  }
 }else throw new Error('Only PNG and JPEG image signatures are supported.');
 if(!width||!height)throw new Error('Image has invalid zero dimensions.');
 if(width>REFERENCE_LIMITS.dimension||height>REFERENCE_LIMITS.dimension||width*height>REFERENCE_LIMITS.pixels)throw new Error(`Image is ${width} × ${height} pixels (${(width*height/1000000).toFixed(2)} megapixels). Limit: ${REFERENCE_LIMITS.dimension} pixels per side and ${(REFERENCE_LIMITS.pixels/1000000).toFixed(2)} megapixels. Resize the image before importing.`);
 return {mime,width,height};
}
export function validateReferences(value:unknown):ReferenceImage[]{
 if(!Array.isArray(value)||value.length>REFERENCE_LIMITS.count)throw new Error('At most six references are supported.');
 let total=0;const ids=new Set<string>();
 return value.map(r=>{
  if(!r||typeof r!=='object'||!(r.bytes instanceof Uint8Array))throw new Error('Invalid reference asset.');
  const header=imageHeader(r.bytes);total+=r.bytes.length;if(total>REFERENCE_LIMITS.totalBytes)throw new Error('Reference source budget exceeds 12 MiB.');
  if(typeof r.id!=='string'||!r.id||r.id.length>80||ids.has(r.id)||typeof r.name!=='string'||r.name.length>120||r.width!==header.width||r.height!==header.height||r.mime!==header.mime||!['workspace','sculpture'].includes(r.space))throw new Error('Invalid reference identity, dimensions or space.');ids.add(r.id);
  for(const key of ['position','rotation'])if(!Array.isArray(r[key])||r[key].length!==3||!r[key].every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1000))throw new Error('Invalid reference transform.');
  if(!Number.isFinite(r.size)||r.size<.05||r.size>10||!Number.isFinite(r.opacity)||r.opacity<.05||r.opacity>1||['visible','locked','twoSided'].some(k=>typeof r[k]!=='boolean'))throw new Error('Invalid reference display.');
  if(r.flipX!==undefined&&typeof r.flipX!=='boolean')throw new Error('Invalid reference Flip X setting.');
  return {...r,...header,position:[...r.position],rotation:[...r.rotation]} as ReferenceImage;
 });
}
export function createReference(bytes:Uint8Array,name:string,id:string):ReferenceImage{return {id,name:name.slice(0,120),bytes,...imageHeader(bytes),space:'workspace',position:[1,0,0],rotation:[0,0,0],size:1,opacity:1,visible:true,locked:true,twoSided:true};}
