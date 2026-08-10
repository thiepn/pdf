const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..", "..");

async function loadSource(relativePath) {
  return import(pathToFileURL(path.join(root, relativePath)).href);
}

(async () => {
  const [coordinates, router, selection, plan, activity, preservation] = await Promise.all([
    loadSource("src/core/coordinates.ts"),
    loadSource("src/core/appRouter.ts"),
    loadSource("src/organizer/pageSelection.ts"),
    loadSource("src/organizer/pagePlan.ts"),
    loadSource("src/activity/activityModel.ts"),
    loadSource("src/workspace/preservationContracts.ts")
  ]);

  for (const rotation of [0, 90, 180, 270]) {
    const service = new coordinates.CoordinateService(coordinates.createPdfViewportMatrix(612, 792, 1.75, rotation));
    const source = { x: 123.456, y: 654.321 };
    const roundTrip = service.viewportToPdf(service.pdfToViewport(source));
    assert.ok(Math.abs(roundTrip.x - source.x) < 1e-8);
    assert.ok(Math.abs(roundTrip.y - source.y) < 1e-8);
  }
  assert.deepEqual(router.readAppRoute("#/viewer/project%201"), { name: "viewer", projectId: "project 1" });
  assert.deepEqual(router.readAppRoute("#/workspace/project%201/professional"), { name: "workspace", projectId: "project 1", mode: "professional" });
  assert.equal(router.routeHref({ name: "editor", projectId: "p" }), "#/workspace/p/editor");
  assert.equal(router.routeHref({ name: "maintenance" }), "#/maintenance");
  assert.deepEqual([...selection.parsePageSelection("1-10,!4,!last", 10).pages].sort((a,b)=>a-b), [1,2,3,5,6,7,8,9]);
  assert.equal(plan.normalizeRotation(-90), 270);
  assert.equal(activity.classifyReceipt("backup.lpsproject", "application/octet-stream"), "backup");
  assert.equal(preservation.getPreservationContract("viewer").destructive, false);
  assert.equal(preservation.getPreservationContract("secure").destructive, true);
  assert.ok(activity.receiptToCsvRow({ id:"1", schemaVersion:1, kind:"report", filename:'a,"b.json', mimeType:"application/json", byteLength:1, sha256:"x", createdAt:0, route:"#/", releaseVersion:"test" }).includes('"a,""b.json"'));
  console.log(JSON.stringify({ passed: true, checks: 15 }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
