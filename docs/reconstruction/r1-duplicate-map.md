# R1 Duplicate & Overlap Map

R1 treats duplicate UI as a product defect when the user must understand implementation differences to choose between entry points. Contextual shortcuts are allowed only when they resolve to one canonical capability contract.

| User intent | Current overlapping surfaces | R1 decision | Canonical direction for R2 |
|---|---|---|---|
| Edit existing text | Edit; Print & Advanced > Text | Remove legacy Professional exposure | Edit |
| Edit/replace existing image | Edit; Print & Advanced > Images | Remove legacy Professional exposure | Edit |
| Fill forms | Forms & Protect; native Edit support; Compliance Forms | Keep fill path; reconcile authoring separately | Forms / contextual Edit |
| Create form fields | Compliance Forms; Secure says creation is deferred | Treat as experimental until qualified | Forms > Create fields only after R3/R4 gate |
| Visual signature | Edit; Forms & Protect > Signatures | Keep one signing intent; security page may explain state | Edit > Sign |
| Inspect digital signatures | Forms & Protect; Compliance | Merge inspection | More > Signatures / Document details |
| Remove metadata | Optimize; Toolbox Metadata; Sanitize; Batch | One canonical action ID with contextual shortcuts | Protect/Privacy or Optimize |
| Security/document inspection | Forms & Protect Inspector; Inspect; Compliance preflight | Merge technical evidence | More > Document details |
| Archive readiness | Print & Advanced Archive; Compliance Standards/PDF-A | Merge into Compliance engine | More > Standards / Archive |
| Accessibility | Compliance; preflight findings | Keep one specialist flow | More > Accessibility |
| Lossless optimization | Optimize; Preservation structure-safe optimize; Batch | Canonical Optimize; Batch is automation shortcut | Optimize |
| Print imposition | Print & Advanced; Preservation vector layout | Merge variants under one task | More > Print layout |
| Crop | Toolbox; Batch | Toolbox capability becomes canonical Pages action; Batch stays automation | Pages > Crop |
| Split | Toolbox fixed split; Pages extract; Batch terminal split | Separate semantic split/extract but one Pages family | Pages > Split / Extract |
| Page decoration | Toolbox; Batch | Canonical task actions; Batch stays automation | Pages > More |
| Page numbering | Toolbox; Bates; Batch | Keep ordinary page numbers distinct from legal Bates numbering | Pages > Page numbers; More > Bates |
| Grayscale | Toolbox; Batch | Canonical conversion; Batch stays automation | Convert > Grayscale |
| Download/project output | Most modes have Download + Save as project | Standardize wording/placement later | Shared output pattern |
| Storage health | Storage page; Maintenance | Merge ordinary support path | Troubleshooting & recovery |
| Diagnostics | App shell; Help; About; Diagnostics page | Hide from normal navigation; keep support links | About/Help technical tools |
| App validation | App shell; Help; About | Hide from normal navigation; keep release/support access | About technical tools |
| PWA readiness | Home; Settings | Remove Home duplicate | Settings |

## Duplicate policy

R2 and later phases must follow these rules:

1. **One canonical name per user intent.**
2. **One canonical action ID per user intent.**
3. A contextual shortcut may exist only if it routes to the same contract and terminology.
4. Two implementations may coexist internally when they solve different PDF structures, but the UI should select or explain the appropriate engine.
5. Legacy routes may redirect for compatibility without appearing in navigation/search.
6. Specialist variants may be exposed only when their distinction changes a decision the user actually needs to make.
7. A generic container is not justification for duplicate naming.

## Containers to dissolve

### Toolbox

Keep its capabilities; dissolve the container as a primary mental model.

### Forms & Protect

Keep forms, redaction, sanitization, and protection; separate them by user intent.

### Print & Advanced

Remove superseded editing paths and distribute the remaining specialist capabilities under More/Convert/Print.

### Preservation

Merge structural guarantees into canonical Optimize/Print/Document-details paths and remove standalone exposure.

### Accessibility workspace

Retain Standards and Accessibility specialist tasks, but move signatures/forms to their canonical product areas.
