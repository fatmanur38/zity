/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SETTLEMENT_MODE?: "mock" | "zcash-testnet";
  readonly VITE_ZCASH_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
