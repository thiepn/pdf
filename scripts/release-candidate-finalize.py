from pathlib import Path
p=Path('src/views/EditorPage.tsx')
s=p.read_text()
old='<span className="editor-runtime-status">{status} · {detectedPdfItemCount}'
assert s.count(old)==1
p.write_text(s.replace(old,'<span className="editor-runtime-status">Ready · {detectedPdfItemCount}'))
p=Path('tests/e2e/p40-editor-secondary-language.spec.ts')
s=p.read_text()
old='await expect(fileGroup).toContainText("Edited PDF downloaded");'
assert s.count(old)==1
p.write_text(s.replace(old,'await expect(page.getByRole("status", { name: "Document status", exact: true })).toHaveText("Edited PDF downloaded");'))
p=Path('tests/e2e/release-reader-state.spec.ts')
s=p.read_text().replace('Skip to main content','Skip to content')
s+='''

test("initial page effects keep an intentionally focused skip link", async ({ page }) => {
  await page.goto("./#/home");
  const skip = page.getByRole("link", { name: "Skip to content", exact: true });
  await skip.focus();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-workspace")).toBeFocused();
});
'''
p.write_text(s)
Path('scripts/release-candidate-finalize.py').unlink()
