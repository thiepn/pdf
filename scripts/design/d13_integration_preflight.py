#!/usr/bin/env python3
"""D13 integration ancestry + source preflight. NEVER grants release approval.

D8 remains the authoritative 18-item human and real-device evidence gate.
This audit checks candidate *structure*, not real PDF export fidelity.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

MANIFEST = "docs/design/D13_INTEGRATION_MANIFEST.json"
EXPECTED_ROOT = "feature/p17-deep-native-content-fidelity"
EXPECTED_BRANCH = "design/d13-integration-release-candidate"
REQUIRED_CSS = (
    "studio-workspace-d1.css",
    "studio-discovery-d2.css",
    "studio-editor-d3-live.css",
    "studio-layers-d4-live.css",
    "studio-quicktools-d5-live.css",
    "studio-responsive-d6-live.css",
    "studio-polish-d7-live.css",
    "studio-editor-d10-status.css",
    "studio-tokens-d11.css",
    "studio-chrome-d11.css",
    "studio-visual-qa-d12.css",
)
SOURCE_MARKERS = {
    "src/views/HomePage.tsx": ("product-home--workspace", "TaskDirectory"),
    "src/views/EditorPage.tsx": ("data-d3-editor", "data-d10-status", "D7KeyboardHelp", "exportEditorPdf"),
    "src/views/QuickToolPage.tsx": ("data-d5-quick", "OutputTrustPanel", "runQuickOperation"),
    "src/product/EditorDocumentStatus.tsx": ("Document status bar",),
    "src/product/TaskDirectory.tsx": ("product-directory--d2",),
}

def git(root: Path, *args: str) -> tuple[int, str]:
    try:
        run = subprocess.run(("git", "-C", str(root), *args), text=True,
                             capture_output=True, check=False, timeout=15)
        return run.returncode, run.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return 127, ""

def patch_id(root: Path, commit: str) -> str | None:
    """Independent git patch fingerprint; identical replays get the same value."""
    try:
        diff = subprocess.run(
            ("git", "-C", str(root), "show", "--format=", "--no-ext-diff", commit),
            text=True, capture_output=True, check=False, timeout=15)
        if diff.returncode or not diff.stdout.strip():
            return None
        patch = subprocess.run(
            ("git", "patch-id", "--stable"),
            text=True, input=diff.stdout, capture_output=True, check=False, timeout=15)
        return patch.stdout.split()[0] if patch.returncode == 0 and patch.stdout.split() else None
    except (OSError, subprocess.TimeoutExpired):
        return None

def validate_manifest(manifest: dict) -> list[str]:
    errors = []
    if manifest.get("schema_version") != 1 or manifest.get("repository") != "thiepn/pdf":
        errors.append("schema/repository mismatch")
    if manifest.get("candidate_branch") != EXPECTED_BRANCH:
        errors.append("candidate branch mismatch")
    if manifest.get("status") != "PREPARATION_ONLY" or any(manifest.get(k) is not False for k in
         ("release_qualified", "automatic_merge_allowed", "automatic_deployment_allowed")):
        errors.append("candidate must explicitly prohibit automatic release")
    dependency = manifest.get("root_dependency") or {}
    if dependency.get("branch") != EXPECTED_ROOT or dependency.get("review_required") is not True:
        errors.append("missing P17 root dependency / review requirement")
    if not re.fullmatch("[0-9a-f]{40}", str(dependency.get("sha", ""))):
        errors.append("P17 dependency SHA invalid")
    phases = manifest.get("phases")
    if not isinstance(phases, list) or len(phases) != 12:
        return errors + ["expected precisely twelve phases"]
    previous = EXPECTED_ROOT
    seen_prs, seen_branches, seen_shas = set(), set(), set()
    for expected_phase, phase in enumerate(phases, 1):
        if not isinstance(phase, dict):
            errors.append(f"phase {expected_phase}: invalid row")
            continue
        ref = f"phase {expected_phase}"
        if phase.get("phase") != expected_phase:
            errors.append(f"{ref}: phase order mismatch")
        branch = phase.get("branch")
        if not isinstance(branch, str) or not branch.startswith("design/d"):
            errors.append(f"{ref}: branch invalid")
        if phase.get("base_branch") != previous:
            errors.append(f"{ref}: broken stacked base relationship")
        previous = branch
        pr = phase.get("pr")
        if not isinstance(pr, int) or pr <= 0 or pr in seen_prs:
            errors.append(f"{ref}: PR invalid/duplicate")
        seen_prs.add(pr)
        sha = phase.get("commit_sha")
        if not re.fullmatch("[0-9a-f]{40}", str(sha)):
            errors.append(f"{ref}: immutable full commit SHA required")
        if branch in seen_branches or sha in seen_shas:
            errors.append(f"{ref}: duplicate branch/SHA")
        replay_sha = phase.get("equivalent_applied_commit_sha")
        if expected_phase == 5:
            if not re.fullmatch("[0-9a-f]{40}", str(replay_sha)):
                errors.append("phase 5: equivalent D6 replay SHA required")
        elif replay_sha is not None:
            errors.append(f"{ref}: unexpected replay exception")
        seen_branches.add(branch)
        seen_shas.add(sha)
    if previous != "design/d12-visual-qa-css-cleanup":
        errors.append("D12 must be the immediate D13 parent")
    if len(manifest.get("required_ci", [])) < 9 or len(manifest.get("required_manual", [])) < 6:
        errors.append("qualification inventory incomplete")
    if manifest.get("evidence_file") != "docs/design/D8_RELEASE_EVIDENCE.template.json":
        errors.append("D8 original evidence source changed")
    return errors

def evaluate(manifest: dict, root: Path, *, ancestors: bool = False) -> dict:
    errors = validate_manifest(manifest)
    imports_file = root / "src/product/product.css"
    imports = imports_file.read_text(encoding="utf-8") if imports_file.is_file() else ""
    parsed = re.findall(r'@import\s+"\./([^"]+)";', imports)
    if len(parsed) != len(set(parsed)):
        errors.append("duplicate CSS imports")
    for filename in REQUIRED_CSS:
        if parsed.count(filename) != 1 or not (root / "src/product" / filename).is_file():
            errors.append(f"CSS not mounted exactly once: {filename}")
    if parsed and parsed[-1] != "studio-visual-qa-d12.css":
        errors.append("D12 integration visual corrections must be last")
    for relative, markers in SOURCE_MARKERS.items():
        file = root / relative
        source = file.read_text(encoding="utf-8") if file.is_file() else ""
        for marker in markers:
            if marker not in source:
                errors.append(f"missing real runtime mount: {relative}: {marker}")
    evidence = root / "docs/design/D8_RELEASE_EVIDENCE.template.json"
    try:
        d8 = json.loads(evidence.read_text(encoding="utf-8"))
        if len(d8.get("requirements", {})) != 18 or d8.get("status") != "NOT_QUALIFIED":
            errors.append("D8 inventory not present as the pending fail-closed template")
    except (OSError, json.JSONDecodeError):
        errors.append("D8 evidence template missing or malformed")

    ancestry = []
    if ancestors:
        code, head = git(root, "rev-parse", "HEAD")
        if code or len(head) != 40:
            errors.append("checkout HEAD unavailable")
        for phase in manifest.get("phases", []):
            sha = phase.get("commit_sha", "")
            exit_code, _ = git(root, "merge-base", "--is-ancestor", sha, "HEAD")
            ancestry_row = {"phase": phase.get("phase"), "ancestor": exit_code == 0,
                            "equivalent_patch_verified": False}
            if exit_code != 0:
                replay = phase.get("equivalent_applied_commit_sha")
                replay_ancestor = bool(replay) and git(root, "merge-base", "--is-ancestor", replay, "HEAD")[0] == 0
                original_patch = patch_id(root, sha) if replay_ancestor else None
                replay_patch = patch_id(root, replay) if replay_ancestor else None
                if replay_ancestor and original_patch and replay_patch and original_patch == replay_patch:
                    ancestry_row["equivalent_patch_verified"] = True
                    ancestry_row["replay_commit"] = replay
                else:
                    errors.append(f"phase {phase.get('phase')} commit absent without verified identical patch")
            ancestry.append(ancestry_row)
        root_sha = manifest.get("root_dependency", {}).get("sha", "")
        if git(root, "merge-base", "--is-ancestor", root_sha, "HEAD")[0] != 0:
            errors.append("P17 foundation absent from candidate")
    # D8's manual approval is intentionally *not* evaluated as publishable here.
    return {
        "phase": "D13",
        "repository": "thiepn/pdf",
        "integration_preflight": "PASS" if not errors else "FAIL",
        "errors": errors,
        "ancestry_checked": ancestors,
        "ancestry": ancestry,
        "root_dependency_review_required": True,
        "release_status": "NOT_QUALIFIED",
        "release_approved": False,
        "automatic_deployment_allowed": False,
        "next_gate": "D8 evidence review, P17/P18 fidelity, 3-browser real PDF tests, physical devices and deployment approval"
    }

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--manifest", type=Path, default=None)
    parser.add_argument("--check-ancestors", action="store_true")
    parser.add_argument("--assert-prepared", action="store_true")
    args = parser.parse_args()
    root = args.repo.resolve()
    path = args.manifest or (root / MANIFEST)
    data = json.loads(path.read_text(encoding="utf-8"))
    result = evaluate(data, root, ancestors=args.check_ancestors)
    print(json.dumps(result, indent=2))
    return int(args.assert_prepared and result["integration_preflight"] != "PASS")

if __name__ == "__main__":
    raise SystemExit(main())
