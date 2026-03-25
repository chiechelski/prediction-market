/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_ENDPOINT?: string;
  readonly VITE_COLLATERAL_MINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
