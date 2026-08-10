const projectPasswords = new Map<string, string>();

export function rememberProjectSessionPassword(projectId: string, password: string): void {
  if (password) projectPasswords.set(projectId, password);
}

export function readProjectSessionPassword(projectId: string): string | undefined {
  return projectPasswords.get(projectId);
}
