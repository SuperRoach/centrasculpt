import {createServer} from 'vite';
import {loadTlsConfig} from './tls-config.mjs';
try{
 const server=await createServer({server:{host:'0.0.0.0',port:5174,strictPort:true,https:loadTlsConfig()}});
 await server.listen();server.printUrls();
 console.log('Quest Browser requires trust in the certificate issuer; Mac trust alone does not establish headset trust. See docs/QUEST_WEBXR.md.');
}catch(error){console.error(error.message);process.exitCode=1;}
