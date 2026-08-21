export const APP_NAME = "PDF Studio";
export const APP_VERSION = "7.0.0";
export type AppReleaseChannel = "release-candidate" | "stable";
export const APP_CHANNEL: AppReleaseChannel = import.meta.env.VITE_RELEASE_CHANNEL === "stable" ? "stable" : "release-candidate";
export const PROJECT_PACKAGE_VERSION = 9;
export const SUPPORTED_PROJECT_PACKAGE_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const DATABASE_SCHEMA_VERSION = 13;
export const BUILD_SOURCE_URL = import.meta.env.VITE_SOURCE_URL ?? "";
export const BUILD_BASE_PATH = import.meta.env.BASE_URL ?? "/";
export const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP ?? "development";

export function isSupportedProjectPackageVersion(value: number): value is (typeof SUPPORTED_PROJECT_PACKAGE_VERSIONS)[number] {
  return (SUPPORTED_PROJECT_PACKAGE_VERSIONS as readonly number[]).includes(value);
}

export interface ReleaseInformation {
  name: string;
  version: string;
  channel: AppReleaseChannel;
  buildTimestamp: string;
  sourceUrl: string;
  basePath: string;
}

export function getReleaseInformation(): ReleaseInformation {
  return {
    name: APP_NAME,
    version: APP_VERSION,
    channel: APP_CHANNEL,
    buildTimestamp: BUILD_TIMESTAMP,
    sourceUrl: BUILD_SOURCE_URL,
    basePath: BUILD_BASE_PATH
  };
}
