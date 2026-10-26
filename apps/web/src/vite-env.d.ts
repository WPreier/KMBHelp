/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_URL_WWW?: string;
  readonly VITE_PUBLIC_URL_HOME?: string;
  readonly VITE_PUBLIC_URL_WIKI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
