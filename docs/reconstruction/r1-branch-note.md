# R1 Branch Hygiene Note

R1 is based directly on merged R0 `main` at `d211627adbe08d6e41eabb3b5c26fe25e1b71929`.

An empty `noop-placeholder` branch was created accidentally while preparing the R1 pull request. It points at `main`, contains no R1 commits, is not part of the reconstruction chain, and must not be used as a base for later phases. The available connector does not expose branch deletion, so this note prevents accidental use until it is deleted through GitHub's normal branch UI.
