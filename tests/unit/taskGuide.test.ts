import { describe, expect, it } from "vitest";
import { taskFirstHelpArticles } from "../../src/help/taskGuide";
import { getTask, taskRoute } from "../../src/ia/taskCatalog";
import { readAppRoute, routeHref } from "../../src/core/appRouter";

describe("Task-first user guide", () => {
  it("links instructions to existing, routable tools", () => {
    const linked = taskFirstHelpArticles.filter(article => article.taskId);
    expect(linked.length).toBeGreaterThan(20);
    for (const article of linked) {
      const task = getTask(article.taskId); expect(task, article.id).toBeDefined();
      const route = taskRoute(task!); expect(route, article.id).not.toBeNull();
      expect(readAppRoute(routeHref(route!))).toEqual(route);
    }
  });
  it("does not teach the deleted rail and tab navigation", () => {
    const guidance = taskFirstHelpArticles.flatMap(article => article.steps).join(" ");
    expect(guidance).not.toContain("editor rail");
    expect(guidance).not.toContain("Open Pages.");
    expect(guidance).not.toContain("Choose Watermark & page numbers");
  });
  it("states conversion and redaction boundaries beside the instructions", () => {
    const word = taskFirstHelpArticles.find(article => article.id === "word-export")!;
    expect(word.summary).toContain("does not reconstruct");
    expect(word.steps.join(" ")).toContain("Office-file import are not implemented");
    expect(taskFirstHelpArticles.find(article => article.id === "redaction")!.steps.join(" ")).toContain("A mark is not permanent removal");
  });
});
