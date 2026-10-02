import { beforeEach, describe, expect, it } from "vitest";
import projectRepositorySource from "../../src/projects/projectRepository.ts?raw";
import {
  forgetProjectSessionPassword,
  readProjectSessionPassword,
  rememberProjectSessionPassword
} from "../../src/security/sessionPasswords";

describe("project session password lifecycle", () => {
  beforeEach(() => {
    forgetProjectSessionPassword("project-a");
    forgetProjectSessionPassword("project-b");
  });

  it("forgets only the deleted project's in-memory password", () => {
    rememberProjectSessionPassword("project-a", "alpha-secret");
    rememberProjectSessionPassword("project-b", "beta-secret");

    forgetProjectSessionPassword("project-a");

    expect(readProjectSessionPassword("project-a")).toBeUndefined();
    expect(readProjectSessionPassword("project-b")).toBe("beta-secret");
  });

  it("ties successful project deletion to session-password cleanup", () => {
    const persistentDelete = 'await idbDelete("projects", projectId);';
    const credentialDelete = "forgetProjectSessionPassword(projectId);";
    expect(projectRepositorySource).toContain(credentialDelete);
    expect(projectRepositorySource.indexOf(credentialDelete))
      .toBeGreaterThan(projectRepositorySource.indexOf(persistentDelete));
  });
});
