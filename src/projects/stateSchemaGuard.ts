export function assertReadableStateSchema(value: unknown, current: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} has an invalid schema version and was not modified.`);
  }
  const version = value as number;
  if (version > current) {
    throw new Error(`${label} was created by a newer PDF Studio version (state schema ${version}; this build supports ${current}). Update the app before editing this project. The stored state was not modified.`);
  }
  return version;
}
