/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CLIENT_TYPE?: string;
  readonly VITE_DEVICE_ID?: string;
  readonly VITE_BRANCH_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

