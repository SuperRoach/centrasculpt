/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __AGENT_ENABLED__: boolean;
declare module "virtual:centra-agent" {
  const credentials: { url: string; token: string };
  export default credentials;
}
