# Phase 29 Performance Budget

Viewer resource policy now has three document classes:

| Class | Trigger | Max renders | Pixel ratio cap | Activation margin | Eviction distance |
|---|---|---:|---:|---:|---:|
| Normal | below large thresholds | profile-dependent, ≤4 | ≤3× | ≤1600 px | ≤5 screens |
| Large | ≥250 pages or ≥100 MB | ≤2 | ≤1.5× | ≤900 px | ≤2 screens |
| Extreme | ≥1,000 pages or ≥500 MB | **1** | **≤1.25×** | **≤450 px** | **≤1.2 screens** |

Additional containment is applied to off-screen thumbnails, project cards, tool tiles, and PDF page shells. These safeguards prioritize browser stability over maximum canvas density on unusually large documents.
