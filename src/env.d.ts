interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_SOURCE_URL?: string;
  readonly VITE_BUILD_TIMESTAMP?: string;
  readonly VITE_RELEASE_CHANNEL?: "release-candidate" | "stable";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
