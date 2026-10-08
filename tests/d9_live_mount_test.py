import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("d9_live_mount_audit", ROOT / "scripts/design/d9_live_mount_audit.py")
audit_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit_module)

class D9MountTests(unittest.TestCase):
    def test_actual_checkout_has_runtime_mounts_and_is_not_release_qualified(self):
        report = audit_module.audit(ROOT)
        self.assertEqual(report["passed"], report["total"], report["checks"])
        self.assertEqual(report["result"], "LIVE_WIRING_OBSERVED_NOT_RELEASE_QUALIFIED")
        self.assertFalse(report["production_release_qualified"])

    def test_css_only_cannot_pass_as_runtime_integration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src/product").mkdir(parents=True)
            for style in audit_module.STYLES:
                (root / "src/product" / style).write_text("/* stub */", encoding="utf-8")
            (root / "src/product/product.css").write_text(
                "".join(f'@import "./{style}";\n' for style in audit_module.STYLES),
                encoding="utf-8"
            )
            report = audit_module.audit(root)
            self.assertEqual(report["result"], "NOT_WIRED")
            self.assertFalse(report["production_release_qualified"])

    def test_missing_style_imports_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for rel, markers in audit_module.MARKERS.values():
                file = root / rel
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text("\n".join(markers), encoding="utf-8")
            (root / "src/product").mkdir(parents=True, exist_ok=True)
            for style in audit_module.STYLES:
                (root / "src/product" / style).write_text("/* exists but not imported */", encoding="utf-8")
            (root / "src/product/product.css").write_text("", encoding="utf-8")
            report = audit_module.audit(root)
            self.assertEqual(report["result"], "NOT_WIRED")
            self.assertEqual(report["passed"], len(audit_module.MARKERS))
            self.assertFalse(report["production_release_qualified"])

    def test_duplicate_style_import_is_not_qualified(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for rel, markers in audit_module.MARKERS.values():
                file = root / rel
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text("\n".join(markers), encoding="utf-8")
            (root / "src/product").mkdir(parents=True, exist_ok=True)
            for style in audit_module.STYLES:
                (root / "src/product" / style).write_text("/* valid */", encoding="utf-8")
            imports = "".join(f'@import "./{style}";\n' for style in audit_module.STYLES)
            imports += f'@import "./{audit_module.STYLES[0]}";\n'
            (root / "src/product/product.css").write_text(imports, encoding="utf-8")
            report = audit_module.audit(root)
            self.assertEqual(report["result"], "NOT_WIRED")
            self.assertFalse(report["production_release_qualified"])

if __name__ == "__main__":
    unittest.main()
