from pathlib import Path
p=Path('src/views/QuickToolPage.tsx')
s=p.read_text().replace('import "../quick/quickTools.css";', '''import { Icon } from "../components/Icon";
import { FilePreview } from "../product/FilePreview";
import { TaskGlyph } from "../product/TaskGlyph";
import { taskCopy } from "../product/TaskDirectory";
import { takeTaskFiles } from "../product/fileHandoff";''')
s=s.replace('const heldFile = useRef<File | null>(null);','const heldFile = useRef<File | null>(null);\n  const draggedFile = useRef<number | null>(null);')
s=s.replace('heldFile.current ??= takeQuickResult(taskId);','const staged = takeTaskFiles(taskId);\n      if (staged?.length) { await readFiles(staged); return; }\n      heldFile.current ??= takeQuickResult(taskId);')
start=s.index('  return <div className="quick-workflow">')
old=s[start:]
opt=old[old.index('      {taskId === "split-pdf"'):old.index('      <button className="button quick-run"')]
opt=opt.replace('Images become PDF pages in the order shown. Use the arrows to reorder them.', 'Images become pages in the order shown. Drag a file or use its move buttons.')
res=old[old.index('    {result ? <section'):old.index('\n  </div>;')]
res=res.replace('<p className="eyebrow">Done</p>', '<span className="task-success-mark" aria-hidden="true">✓</span><p className="eyebrow">COMPLETE</p>')
res=res.replace('<h2>Your', '<h2>Your')
res=res.replace('    </section> : null}', '''      <div className="task-result-actions"><button className="button button--secondary" disabled={busy} onClick={() => { setResult(null); setError(""); }} type="button">Edit options</button><a href={routeHref({ name: "home" })}>Start a new task</a></div>
    </section> : null}''')
new='''  const filePicker = <input ref={inputRef} aria-label={images ? "Image files" : "PDF files"} hidden accept={images ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" : "application/pdf,.pdf"} multiple={multiple} onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void readFiles(files); }} type="file" />;
  const pickLabel = inputs.length ? multiple ? "Add more files" : "Change PDF" : images ? "Choose images" : multiple ? "Choose PDFs" : "Choose PDF";
  return <div className={`quick-workflow task-page${inputs.length && !result ? " task-page--working" : ""}`}>
    <a className="product-back" href={routeHref({ name: "tools" })}><Icon name="arrow-left" size={17} /> All PDF tools</a>
    <header className="task-heading"><TaskGlyph task={task} large /><div><h1>{task.label}</h1><p>{taskCopy(task)}</p></div><span className="task-step">{result ? "3 / 3 · Download" : inputs.length ? "2 / 3 · Make it yours" : "1 / 3 · Choose your files"}</span></header>
    {filePicker}
    {projectId && !result ? <p className="quick-warning">This tool uses the saved source PDF. Editor-only text, drawings, signatures, and unsaved changes are not included; export your edited PDF first to include them.</p> : null}
    {!inputs.length && !result && !pending ? <section className={`product-dropzone task-dropzone${dragging ? " is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!locked) void readFiles([...event.dataTransfer.files]); }} aria-label="Choose input files">
      <span className="product-dropzone__icon"><Icon name={images ? "image" : "documents"} size={32} /></span><h2>{images ? "Drop your images here" : multiple ? "Drop your PDFs here" : "Drop your PDF here"}</h2><p>{multiple ? "Choose several files. Arrange them in the next step." : "Your original file stays unchanged."}</p><button className="button" disabled={locked} onClick={() => inputRef.current?.click()} type="button">{pickLabel}<Icon name="plus" size={18}/></button><small>Up to 200 MB total · {images ? "JPG, PNG or WebP" : "PDF files"}</small>
    </section> : null}
    {pending ? <form className="quick-panel task-password" onSubmit={(event) => { event.preventDefault(); void readFiles([pending.file, ...pending.rest], pending.accepted, password); }}><Icon name="secure" size={32}/><h2>This PDF needs its password</h2><p>{pending.file.name}</p><label className="quick-field"><span>Existing PDF password</span><input autoFocus autoComplete="off" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><p className="quick-hint">Used only on this device. This tool does not guess or crack passwords.</p><div className="quick-inline"><button className="button" disabled={loading || !password} type="submit">Unlock for this task</button><button className="button button--secondary" disabled={loading} onClick={() => { const rest = pending.rest; const accepted = pending.accepted; setPending(null); void readFiles(rest, accepted); }} type="button">Skip this file</button></div></form> : null}
    {error ? <div className="error-banner" role="alert"><strong>Could not finish</strong><span>{error}</span></div> : null}
    {progress ? <div className="quick-progress" role="status" aria-live="polite"><span className="spinner" /><span>{progress}</span>{busy ? <button className="button button--secondary" onClick={() => controller.current?.abort()} type="button">Cancel</button> : null}</div> : null}
    {inputs.length && !pending && !result ? <div className="task-workbench">
      <section className={`task-canvas${dragging ? " is-dragging" : ""}`} aria-label="Document preview and selection" onDragOver={(event) => { event.preventDefault(); if (!locked && event.dataTransfer.types.includes("Files")) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setDragging(false); if (!locked) void readFiles([...event.dataTransfer.files]); }}>
        <div className="task-canvas__bar"><div><strong>{selectionTool ? "Select your pages" : multiple ? "Arrange your files" : "Your document"}</strong><span>{inputs.length === 1 ? `${inputs[0].pageCount} ${images ? "image" : "pages"}` : `${inputs.length} files`} · {formatBytes(inputSize)}</span></div><button className="button button--secondary" disabled={locked} onClick={() => inputRef.current?.click()} type="button"><Icon name="plus" size={17}/>{pickLabel}</button></div>
        {taskId === "remove-pages" ? <p className="task-selection-instruction"><strong>Select the pages to remove.</strong> All other pages will stay.</p> : null}
        {selectionTool ? <QuickPagePicker disabled={locked} input={inputs[0]} selection={options.selection} onChange={(selection) => change({ selection })} /> : <ol className={`task-file-grid${multiple ? "" : " task-file-grid--single"}`} aria-label="Files in output order">{inputs.map((file, index) => <li className="task-file-card" key={file.id} draggable={multiple && !locked} onDragStart={(event) => { draggedFile.current = index; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", file.id); }} onDragEnd={() => { draggedFile.current = null; }} onDragOver={(event) => { if (multiple && draggedFile.current !== null) event.preventDefault(); }} onDrop={(event) => { const from = draggedFile.current; if (from === null || locked) return; event.preventDefault(); event.stopPropagation(); const next = [...inputs]; const [item] = next.splice(from, 1); next.splice(index, 0, item); draggedFile.current = null; updateInputs(next); }}>
          <span className="task-file-index">{index + 1}</span>{index < 6 ? <FilePreview input={file} /> : <div className="file-preview file-preview--placeholder"><Icon name="documents" size={42}/></div>}<div className="task-file-caption"><strong title={file.name}>{file.name}</strong><small>{images ? "Image" : `${file.pageCount} pages`} · {formatBytes(file.bytes.byteLength)}</small></div><div className="quick-file-actions">{multiple ? <><button aria-label={`Move ${file.name} up`} disabled={locked || index === 0} onClick={() => move(index, -1)} type="button"><Icon name="arrow-left" size={16}/></button><button aria-label={`Move ${file.name} down`} disabled={locked || index === inputs.length - 1} onClick={() => move(index, 1)} type="button"><Icon name="chevron-right" size={16}/></button></> : null}<button aria-label={`Remove ${file.name}`} disabled={locked} onClick={() => updateInputs(inputs.filter((entry) => entry.id !== file.id))} type="button"><Icon name="close" size={16}/><span>Remove</span></button></div>
        </li>)}</ol>}
        {multiple ? <p className="task-canvas__foot">Drag to reorder. Move buttons work with keyboard and touch.</p> : null}
      </section>
      <form className="quick-panel task-options" onSubmit={(event) => void execute(event)}><fieldset disabled={locked}><legend>Make it yours</legend>
'''+opt+'''      {pageRebuild ? <details className="task-preservation"><summary>What changes in this PDF?</summary><p>Pages retain their appearance and selectable text. Rebuilding pages may not retain document-level bookmarks, attachments, complex forms, or password protection. Existing digital signatures cannot remain valid after changes.</p></details> : null}
      <div className="task-action-dock"><button className="button quick-run" disabled={locked || Boolean(validation)} type="submit">{actionLabels[taskId]}<Icon name="chevron-right" size={19}/></button><small>Your original stays unchanged.</small></div>
    </fieldset></form></div> : null}
'''+res+'''
    {!result ? <div className="task-privacy"><Icon name="shield" size={16}/><span>Files stay on your device. No account. No saved project needed.</span></div> : null}
  </div>;
}
'''
s=s[:start]+new
p.write_text(s)

s=p.read_text()
s=s.replace('<input placeholder="1-3; 4-6; 7-end"', '<input aria-label="Page groups" aria-describedby="page-groups-hint" placeholder="1-3; 4-6; 7-end"')
s=s.replace('<small>Semicolons separate output files.', '<small id="page-groups-hint">Semicolons separate output files.')
s=s.replace('<input min="1" step="1" type="number" value={options.startNumber}', '<input aria-label="Start number" aria-describedby="start-number-hint" min="1" step="1" type="number" value={options.startNumber}')
s=s.replace('<small>Numbers are added at the bottom', '<small id="start-number-hint">Numbers are added at the bottom')
s=s.replace('<input maxLength={140} value={outputName}', '<input aria-label="Output filename" aria-describedby="output-filename-hint" maxLength={140} value={outputName}')
s=s.replace('<small>The correct file extension', '<small id="output-filename-hint">The correct file extension')
p.write_text(s)
