/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_BACKEND_URL?: string
  readonly VITE_AUTOMACAO_PLANILHAS_URL?: string
  readonly VITE_NEXUS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
