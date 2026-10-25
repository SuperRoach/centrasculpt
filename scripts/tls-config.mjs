import {readFileSync} from 'node:fs';
import {createPrivateKey,X509Certificate} from 'node:crypto';
/** Keep private keys outside Vite's public/ directory. Never log certificate/key contents. */
export function loadTlsConfig(env=process.env,read=readFileSync){
 const certPath=env.CENTRA_TLS_CERT??'.certs/centra-cert.pem',keyPath=env.CENTRA_TLS_KEY??'.certs/centra-key.pem';
 try{
  const cert=read(certPath),key=read(keyPath),certificate=new X509Certificate(cert);
  if(!certificate.checkPrivateKey(createPrivateKey(key)))throw new Error('Certificate and private key do not match.');
  const now=Date.now();if(now<Date.parse(certificate.validFrom)||now>Date.parse(certificate.validTo))throw new Error('Certificate is not currently valid.');
  return {cert,key};
 }catch(error){throw new Error(`HTTPS setup failed: ${error.message}. Configure CENTRA_TLS_CERT/CENTRA_TLS_KEY or .certs/centra-{cert,key}.pem; see docs/QUEST_WEBXR.md.`);}
}
