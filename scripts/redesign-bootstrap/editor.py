from pathlib import Path
root=Path('.')
p=root/'src/workspace/UnifiedWorkspace.tsx';s=p.read_text()
s=s.replace('import { Icon, type IconName }', 'import { Icon }')
s=s.replace('import { getProject }', 'import { TaskDirectory } from "../product/TaskDirectory";\nimport { taskRoute } from "../ia/taskCatalog";\nimport { getProject }')
for name in ['closeWorkspaceTab','reorderWorkspaceTabs','restoreClosedWorkspaceTab','setTabPinned']:
 s=s.replace(f'  {name},\n','')
a=s.index('const primaryModes:');b=s.index('export function UnifiedWorkspace',a);s=s[:a]+s[b:]
s=s.replace('  const [projects, setProjects] = useState<Record<string, ProjectManifest>>({});\n','').replace('  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);\n','')
a=s.index('  const hydrateTabProjects =');b=s.index('  const refreshTimeline',a)
s=s[:a]+s[b:]
s=s.replace('  const projectCacheRef = useRef<Record<string, ProjectManifest>>({});\n','')
# inspect removal call sites after transform
import re
s=re.sub(r'^.*(?:hydrateTabProjects\(|projectCacheRef\.current).*$\n?', '', s, flags=re.M)
s=s.replace(', hydrateTabProjects', '').replace('hydrateTabProjects, ', '')
a=s.index('  function activateTab(');b=s.index('  async function createCheckpoint',a);s=s[:a]+s[b:]
s=s.replace('  const activePrimaryMode = primaryModes.includes(mode) ? mode : "toolbox";\n','')
a=s.index('  return <div className="unified-workspace">');b=s.index('    {error ? <div aria-live=',a)
s=s[:a]+'''  return <div className="document-workspace unified-workspace">
    <header className="document-topbar">
      <a className="document-home" href={routeHref({ name: "home" })} aria-label="Back to PDF tools"><Icon name="arrow-left" size={20}/><span>All tools</span></a>
      <div className="document-identity"><h1 id="workspace-document-title" title={project.name}>{project.name}</h1><span>{project.summary.pageCount} pages · {formatBytes(project.byteLength)}{project.summary.encrypted ? " · Protected" : ""}{leaseMode === "read-only" ? " · Read only" : ""}</span></div>
      <div className="document-actions">
        <button aria-controls="document-actions-dialog" aria-expanded={mobileToolsOpen} aria-haspopup="dialog" className="button button--secondary" disabled={Boolean(activeOperation)} onClick={() => setMobileToolsOpen(true)} type="button"><Icon name="tools" size={18}/><span>Document actions</span></button>
        <button aria-label="History and checkpoints" aria-expanded={session.timelineOpen} className="icon-button" onClick={() => void togglePanel("timelineOpen")} title="History and checkpoints" type="button"><Icon name="undo" size={19}/></button>
        {settings.showPreservationWarnings ? <button aria-label="What changes in this PDF?" aria-expanded={session.preservationOpen} className="icon-button document-integrity" onClick={() => void togglePanel("preservationOpen")} title="What changes in this PDF?" type="button"><Icon name="shield" size={19}/></button> : null}
      </div>
    </header>
'''+s[b:]
s=s.replace('<main aria-labelledby="workspace-document-title" className="workspace-mode-content" id="workspace-document-panel" role="tabpanel">','<section aria-labelledby="workspace-document-title" className="workspace-mode-content" id="workspace-document-panel">').replace('      </main>','      </section>')
a=s.index('    <nav className="workspace-mobile-nav"');b=s.index('\n  </div>;',a)
s=s[:a]+'''    {mobileToolsOpen ? <div className="product-modal-backdrop" onClick={closeMobileTools} role="presentation"><section aria-label="Document actions" aria-modal="true" className="product-modal document-task-dialog" id="document-actions-dialog" onClick={(event) => event.stopPropagation()} ref={mobileSheetRef} role="dialog">
      <header><div><p className="eyebrow">WORK WITH THIS DOCUMENT</p><h2>What would you like to do?</h2></div><button className="icon-button" aria-label="Close document actions" onClick={closeMobileTools} type="button"><Icon name="close"/></button></header>
      <p className="product-muted">{project.name}</p>
      <div className="document-action-shortcuts"><button className="button button--secondary" onClick={() => switchMode("editor")} type="button"><Icon name="edit"/>Edit this PDF</button><button className="button button--secondary" onClick={() => switchMode("viewer")} type="button"><Icon name="read"/>Read PDF</button><button className="button button--secondary" onClick={() => switchMode("organizer")} type="button"><Icon name="pages"/>Arrange pages</button></div>
      <TaskDirectory compact projectId={projectId} onChoose={(task) => { if (activeOperation) return; const route = taskRoute(task, projectId); if (route) { closeMobileTools(); navigateTo(route); } }} />
      <p className="product-fineprint">Quick tools use the saved source PDF. Download your edited PDF first to include added text, signatures and other editor changes.</p>
    </section></div> : null}'''+s[b:]
p.write_text(s)
# editor: retain rendering + modification engines, replace navigation surfaces
p=root/'src/views/EditorPage.tsx';s=p.read_text()
s=s.replace('const [propertiesOpen, setPropertiesOpen] = useState(() => !isCompactViewport());','const [propertiesOpen, setPropertiesOpen] = useState(false);')
a=s.index('        <div className="editor-file-group">');b=s.index('        <div className="editor-commandbar__center">',a)
s=s[:a]+'''        <div className="editor-file-group"><span className="editor-purpose">Edit your PDF</span></div>
'''+s[b:]
s=s.replace('<button className="button button--ghost button--small" disabled={!changeCount || processing} onClick={() => void exportPdf(false)} type="button">Download PDF</button><button className="button button--small" disabled={!changeCount || processing} onClick={() => void exportPdf(true)} type="button">Save as project</button>', '<details className="editor-save-options"><summary aria-label="More save options"><Icon name="more"/></summary><button disabled={!changeCount || processing} onClick={() => void exportPdf(true)} type="button">Save as project</button></details><button className="button button--small" disabled={processing} onClick={() => void exportPdf(false)} type="button"><Icon name="download" size={17}/>Download PDF</button>')
a=s.index('      <div className="editor-contextbar">');b=s.index('      <div className="editor-notices">',a)
context=s[a:b]
context=context.replace('<div className="editor-contextbar">', '<div className="editor-contextbar editor-selectionbar">')
# More precise basic controls retained, technical settings disclosed.
context=context.replace('        <label className="editor-toggle"><input checked={editorState.snapEnabled}', '        <details className="editor-guides"><summary>Guides & PDF content</summary><div><label className="editor-toggle"><input checked={editorState.snapEnabled}')
context=context.replace(' />PDF content</label>', ' />PDF content</label></div></details>')
context=context.replace('>{sidebarOpen ? "Hide sidebar" : "Pages / layers"}</button>', ' aria-expanded={sidebarOpen}>{sidebarOpen ? "Hide pages" : "Show pages"}</button>')
context=context.replace('>{propertiesOpen ? "Hide properties" : "Properties"}</button>', ' aria-expanded={propertiesOpen}>{propertiesOpen ? "Hide properties" : "Properties"}</button>')
context=context.replace('<strong aria-live="polite">{localSaveLabel}</strong>', '<strong className="editor-save-status" aria-live="polite">{localSaveLabel}</strong>')
toolbar='''      <nav className="editing-toolbar" aria-label="Editing tools">
        <div className="editing-toolbar__primary">{["select", "text", "highlight", "pen", "image", "signature", "note"].flatMap((id) => { const tool = tools.find((entry) => entry.id === id); return tool ? [tool] : []; }).map((tool) => <button aria-label={tool.label} aria-pressed={editorState.activeTool === tool.id} key={tool.id} onClick={() => activateTool(tool.id)} title={`${tool.label}${tool.key ? ` (${tool.key})` : ""}`} type="button"><Icon name={tool.icon} size={20}/><span>{tool.label}</span></button>)}</div>
        <button aria-expanded={mobileToolsOpen} aria-haspopup="dialog" className="editing-toolbar__more" onClick={() => setMobileToolsOpen(true)} ref={mobileToolsTriggerRef} type="button"><Icon name="more" size={20}/><span>More tools</span></button>
        <input accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importImage(file); event.target.value = ""; }} ref={imageInputRef} type="file" />
      </nav>
'''
s=s[:a]+toolbar+context+s[b:]
a=s.index('        <nav className="editor-toolrail"');b=s.index('        {(sidebarOpen || propertiesOpen)',a);s=s[:a]+s[b:]
a=s.index('<div className="editor-left-tabs">');b=s.index('<div className="editor-left-body">',a)
s=s[:a]+'''<label className="editor-sidebar-select"><span className="visually-hidden">Sidebar content</span><select value={leftTab} onChange={(event) => setLeftTab(event.target.value as LeftTab)}><option value="pages">Pages</option><option value="layers">Objects & layers</option><option value="comments">Comments</option></select></label>'''+s[b:]
s=s.replace('<main className="editor-stage">','<section className="editor-stage" aria-label="PDF page canvas">').replace('zoom={editorState.zoom} /></main>','zoom={editorState.zoom} /></section>')
a=s.index('      <nav className="editor-mobile-toolbar"');b=s.index('      {mobileToolsOpen ?',a);s=s[:a]+s[b:]
s=s.replace('className="editor-tools-sheet-backdrop"','className="product-modal-backdrop editor-tools-sheet-backdrop"').replace('className="editor-tools-sheet"','className="product-modal editor-tools-sheet"')
s=s.replace('disabled={!changeCount || processing} onClick={() => { closeMobileTools(); void exportPdf(false); }}','disabled={processing} onClick={() => { closeMobileTools(); void exportPdf(false); }}')
p.write_text(s)
# ditch accumulated desktop/mobile shell styling, retain canvas scroll protections
p=root/'src/main.tsx';s=p.read_text()
for name in ['workspace/r5Desktop.css','workspace/r5DesktopSurfaces.css','workspace/r5DesktopHome.css','mobile/r6Mobile.css','mobile/r6Landscape.css']:
 s=s.replace(f'import "./{name}";\n','')
s=s.replace('import "./editor/p32ConsumerIa.css";','import "./editor/p32ConsumerIa.css";\nimport "./product/product.css";')
p.write_text(s)

p=root/'src/views/EditorPage.tsx';s=p.read_text()
s=s.replace('    const object = history.present.objects.find((item) => item.id === id);', '    setPropertiesOpen(true);\n    if (isCompactViewport()) setSidebarOpen(false);\n    const object = history.present.objects.find((item) => item.id === id);',1)
s=s.replace('Snap {editorState.snapEnabled ? "on" : "off"}</button></section>', 'Snap {editorState.snapEnabled ? "on" : "off"}</button><button aria-pressed={showNativeContent} onClick={() => setShowNativeContent(!showNativeContent)} type="button">Original PDF content {showNativeContent ? "on" : "off"}</button></section>')
p.write_text(s)
p=root/'src/workspace/UnifiedWorkspace.tsx';s=p.read_text()
s=s.replace('        setProjects((current) => ({ ...current, [manifest.id]: manifest }));\n','')
s=s.replace('<button aria-controls="document-actions-dialog"','<button aria-label="Document actions" aria-controls="document-actions-dialog"')
s=s.replace('<TaskDirectory compact projectId={projectId}', '<div className="document-action-shortcuts"><button className="button button--secondary" onClick={() => { closeMobileTools(); void togglePanel("timelineOpen"); }} type="button">History & checkpoints</button>{settings.showPreservationWarnings ? <button className="button button--secondary" onClick={() => { closeMobileTools(); void togglePanel("preservationOpen"); }} type="button">What changes in this PDF?</button> : null}</div>\n      <TaskDirectory compact projectId={projectId}')
p.write_text(s)
p=root/'src/main.tsx';p.write_text(p.read_text().replace('import "./editor/p32ConsumerIa.css";\n',''))
p=root/'src/App.tsx';p.write_text(p.read_text().replace('<ToolsPage />','<ToolsPage key={route.taskId ?? "directory"} />'))
p=root/'tests/e2e/everyday-workflows.spec.mjs';s=p.read_text()
s=s.replace('  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("1");','  await page.getByRole("button", { name: "Edit options", exact: true }).click();\n  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("1");')
s=s.replace('  await page.getByRole("combobox", { name: "Compression", exact: true }).selectOption("small");','  await page.getByRole("button", { name: "Edit options", exact: true }).click();\n  await page.getByRole("combobox", { name: "Compression", exact: true }).selectOption("small");')
p.write_text(s)
