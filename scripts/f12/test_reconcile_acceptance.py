"""F12 adversarial contracts: authentic GitHub custody cannot become release approval."""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import reconcile_acceptance as accept
import verify_github_evidence as trusted

HEAD = trusted.F11_PARENT


def claimed_runs():
    return [{"name": name, "id": number, "headSha": HEAD, "conclusion": "success"}
            for name, number in trusted.RUNS.items()]


class DenyByDefaultTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "artifact.bin").write_bytes(b"independently authenticated source artifact")

    def packet(self):
        return accept.prepare_packet(HEAD, claimed_runs(), self.root)

    def result(self, packet):
        return accept.validate_packet(packet, self.root, HEAD)

    def test_valid_custody_never_authorizes_deployment(self):
        packet = self.packet()
        status = self.result(packet)
        self.assertTrue(status["packetIntegrityPassed"])
        self.assertEqual(status["releaseDecision"], "DENIED")
        self.assertFalse(status["authorizedToDeploy"])
        self.assertEqual(len(packet["humanRequirements"]), len(accept.REQUIRED_HUMAN))
        self.assertTrue(all(x["status"] == "OPEN" and x["attestation"] is None
                            for x in packet["humanRequirements"]))

    def test_stale_run_sha_denied(self):
        packet = self.packet()
        packet["workflowEvidence"][0]["headSha"] = "b" * 40
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_failed_run_denied(self):
        packet = self.packet()
        packet["workflowEvidence"][1]["conclusion"] = "failure"
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_duplicate_run_id_denied(self):
        packet = self.packet()
        packet["workflowEvidence"][1]["id"] = packet["workflowEvidence"][0]["id"]
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_omitted_required_run_denied(self):
        packet = self.packet()
        packet["workflowEvidence"].pop()
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_unauthorized_approvals_denied(self):
        packet = self.packet()
        packet["humanRequirements"][0]["status"] = "APPROVED"
        packet["releaseDecision"] = "APPROVED"
        packet["releaseEnabled"] = True
        result = self.result(packet)
        self.assertFalse(result["packetIntegrityPassed"])
        self.assertFalse(result["authorizedToDeploy"])

    def test_removed_human_requirement_denied(self):
        packet = self.packet()
        packet["humanRequirements"].pop()
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_changed_original_bytes_denied(self):
        packet = self.packet()
        (self.root / "artifact.bin").write_bytes(b"replacement")
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_added_unreceipted_evidence_denied(self):
        packet = self.packet()
        (self.root / "other.zip").write_bytes(b"untracked")
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_missing_evidence_denied(self):
        packet = self.packet()
        (self.root / "artifact.bin").unlink()
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_path_traversal_and_absolute_paths_denied(self):
        for value in ("../secret", "/etc/passwd", "safe\\..\\evil", "./artifact.bin"):
            packet = self.packet()
            packet["artifactEvidence"][0]["path"] = value
            self.assertFalse(self.result(packet)["packetIntegrityPassed"], value)

    def test_symlink_ancestor_denied(self):
        folder = self.root / "real"
        folder.mkdir()
        (folder / "safe.bin").write_bytes(b"real")
        (self.root / "alias").symlink_to(folder, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.packet()

    def test_bool_for_run_id_denied(self):
        packet = self.packet()
        packet["workflowEvidence"][0]["id"] = True
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_empty_custody_is_not_certified(self):
        (self.root / "artifact.bin").unlink()
        packet = self.packet()
        self.assertFalse(self.result(packet)["packetIntegrityPassed"])

    def test_source_mismatch_denied(self):
        self.assertFalse(accept.validate_packet(self.packet(), self.root, "f" * 40)["packetIntegrityPassed"])


class IndependentGithubValidationTests(unittest.TestCase):
    def synthetic_f11_zip(self, alteration=None):
        files = {}
        for browser in trusted.PROJECTS if hasattr(trusted, "PROJECTS") else ("chromium", "firefox", "webkit"):
            for fixture in ("forms", "comments-measurements", "optimization", "batch-alpha", "batch-beta"):
                files[f"artifacts/f10-exports/{browser}/{fixture}.pdf"] = b"%PDF-1.7\npdf-origin"
            for fixture in ("rotated-crop", "nonzero-origin"):
                files[f"artifacts/f11-exports/{browser}/{fixture}-edited.pdf"] = b"%PDF-1.7\npdf-origin"
        report = {"qualified": True, "crossBrowserGeometryIssues": [],
                  "results": [{"browser": browser, "passed": True,
                               "cases": [{"passed": True} for _ in range(7)]}
                              for browser in ("chromium", "firefox", "webkit")]}
        files["artifacts/f11-crossbrowser-report.json"] = json.dumps(report).encode()
        if alteration:
            alteration(files)
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as z:
            for name, content in files.items():
                z.writestr(name, content)
        return data.getvalue()

    def test_21_real_export_path_contract(self):
        profile = trusted.inspect_zip_bytes(self.synthetic_f11_zip(), "f11-crossbrowser-actual-export-evidence")
        self.assertEqual(profile["exportCount"], 21)

    def test_missing_original_export_rejected(self):
        def remove(files):
            del files["artifacts/f11-exports/firefox/rotated-crop-edited.pdf"]
        with self.assertRaisesRegex(ValueError, "21 exact"):
            trusted.inspect_zip_bytes(self.synthetic_f11_zip(remove), "f11-crossbrowser-actual-export-evidence")

    def test_forged_qualified_report_rejected(self):
        def fail(files):
            f = "artifacts/f11-crossbrowser-report.json"
            report = json.loads(files[f])
            report["results"][2]["cases"][0]["passed"] = False
            files[f] = json.dumps(report).encode()
        with self.assertRaisesRegex(ValueError, "missing failed/pending"):
            trusted.inspect_zip_bytes(self.synthetic_f11_zip(fail), "f11-crossbrowser-actual-export-evidence")

    def test_original_archive_path_traversal_rejected(self):
        memory = io.BytesIO()
        with zipfile.ZipFile(memory, "w") as zip:
            zip.writestr("../escape.pdf", b"%PDF-1.7")
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            trusted.inspect_zip_bytes(memory.getvalue(), "other")

    def test_original_artifact_bytes_sha_mismatch_denied(self):
        with tempfile.TemporaryDirectory() as path:
            original = b"proof bytes"
            wrong_digest = hashlib.sha256(b"tampered evidence").hexdigest()
            runs = dict(trusted.RUNS)
            artifacts = dict(trusted.ARTIFACTS)
            def api(url, token):
                if "/artifacts?" in url:
                    name = artifacts["PDF Studio CI"][0]
                    return {"artifacts": [{"name": name, "id": 42, "expired": False,
                                           "size_in_bytes": len(original),
                                           "digest": "sha256:" + wrong_digest}]}
                return {"id": runs["PDF Studio CI"], "name": "PDF Studio CI",
                        "head_sha": HEAD, "status": "completed", "conclusion": "success"}
            with patch.object(trusted, "RUNS", {"PDF Studio CI": runs["PDF Studio CI"]}), \
                 patch.object(trusted, "ARTIFACTS", {"PDF Studio CI": (artifacts["PDF Studio CI"][0],)}), \
                 patch.object(trusted, "api_json", side_effect=api), \
                 patch.object(trusted, "get_archive", return_value=original):
                with self.assertRaisesRegex(ValueError, "do not match"):
                    trusted.verify(HEAD, "c"*40, "read-only-placeholder", Path(path)/"custody")

    def test_live_run_wrong_head_never_accepted(self):
        with tempfile.TemporaryDirectory() as path:
            def api(url, token):
                return {"id": 38035348951, "name": "PDF Studio CI",
                        "head_sha": "b"*40, "status": "completed", "conclusion": "success"}
            with patch.object(trusted, "RUNS", {"PDF Studio CI": 38035348951}), \
                 patch.object(trusted, "api_json", side_effect=api):
                with self.assertRaisesRegex(ValueError, "Unqualified"):
                    trusted.verify(HEAD, "c"*40, "read-only-placeholder", Path(path)/"custody")

    def test_parent_source_and_implementation_head_are_mandatory(self):
        with tempfile.TemporaryDirectory() as path:
            with self.assertRaises(ValueError):
                trusted.verify("b"*40, "c"*40, "token", Path(path)/"custody")
            with self.assertRaises(ValueError):
                trusted.verify(HEAD, "invalid", "token", Path(path)/"custody")
            with self.assertRaises(ValueError):
                trusted.verify(HEAD, "c"*40, "", Path(path)/"custody")


if __name__ == "__main__":
    unittest.main()
