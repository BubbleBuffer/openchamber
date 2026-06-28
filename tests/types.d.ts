/// <reference types="vite/client" />

declare global {
  interface Window {
    __OPENCHAMBER_HOME__?: string;
    __OPENCHAMBER_LOCAL_ORIGIN__?: string;
  }
}

export {};
