"""D17 publicly served release evidence never equals tag-to-live attestation."""
import unittest

from scripts.design.d17_live_pages_probe import assess_live_assets, probe


class D17LivePagesTests(unittest.TestCase):
    def setUp(self):
        self.metadata = {"schemaVersion": 1, "version": "7.1.4", "channel": "stable", "buildEpoch": 1790860000000}
        self.integrity = {"schemaVersion": 1, "fileCount": 2, "files": [{"name": "index.html"}, {"name": "sw.js"}]}
        self.offline = {"schemaVersion": 2, "strategy": "consumer-core-plus-runtime-features",
                        "assets": ["./index.html", "./release-metadata.json"],
                        "coreAssets": ["./index.html", "./release-metadata.json"],
                        "optionalAssets": ["./workers/native-image.js"]}
        self.worker = ('const RELEASE_VERSION = "7.1.4";\n'
                       'const RELEASE_CHANNEL = "stable";\n'
                       'const RELEASE_BUILD_EPOCH = Number("1790860000000")')

    def audit(self):
        return assess_live_assets(self.metadata, self.integrity, self.offline, self.worker, "<title>PDF Studio</title>")

    def test_consistent_stable_release_artifacts(self):
        self.assertEqual(self.audit(), [])

    def test_accepts_intentional_runtime_placeholder_guard(self):
        # The published worker may contain this literal in a diagnostic guard;
        # the actual RELEASE_* assignments must still carry stable identity.
        self.worker += '\\nreturn !RELEASE_VERSION.startsWith("__LPS_RELEASE_");'
        self.assertEqual(self.audit(), [])

    def test_rejects_unexpanded_release_assignments(self):
        self.worker = self.worker.replace(
            'const RELEASE_VERSION = "7.1.4";',
            'const RELEASE_VERSION = "__LPS_RELEASE_VERSION__";'
        )
        self.assertTrue(any("Unresolved service worker release assignments" in issue for issue in self.audit()))

    def test_rejects_service_worker_from_other_channel(self):
        self.worker = self.worker.replace('"stable"', '"release-candidate"')
        self.assertTrue(any("service worker channel" in error for error in self.audit()))

    def test_rejects_mismatched_metadata_and_service_worker_epochs(self):
        self.metadata["buildEpoch"] += 1
        self.assertTrue(any("service worker epoch" in error for error in self.audit()))

    def test_rejects_incomplete_integrity_inventory(self):
        self.integrity["fileCount"] += 1
        self.assertTrue(any("integrity fileCount" in error for error in self.audit()))

    def test_rejects_dropped_or_duplicate_offline_assets(self):
        self.offline["assets"] = ["./index.html", "./index.html"]
        self.assertTrue(any("core assets" in error for error in self.audit()))

    def test_rejects_non_pdf_studio_site(self):
        self.assertTrue(assess_live_assets(self.metadata, self.integrity, self.offline,
                                           self.worker, "<title>Unauthorized content</title>"))

    def test_refuses_local_and_insecure_url_without_network(self):
        for base in ("http://thiepn.github.io/pdf/", "https://localhost:8080/",
                     "https://127.0.0.1/", "file:///tmp/"):
            with self.subTest(base=base), self.assertRaises(ValueError):
                probe(base)


if __name__ == "__main__":
    unittest.main()
