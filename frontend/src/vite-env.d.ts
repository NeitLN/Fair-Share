/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin, e.g. https://fair-share-4bu9.onrender.com. Empty = same origin. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
