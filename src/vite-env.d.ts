/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK_MODE?: "demo" | "testnet";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
