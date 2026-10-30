"""P19 reproducible in-memory package and fail-closed artifact boundary."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "p19_preview", ROOT / "scripts/p19_package_preview.py")
p19 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p19)


class P19PackageTests(unittest.TestCase):
    def test_deterministic_package_contains_no_training_or_ci(self):
        first, report = p19.create_preview()
        again, second_report = p19.create_preview()
        self.assertEqual(first, again)
        self.assertEqual(report, second_report)
        self.assertFalse(report["releaseEligible"])
        self.assertFalse(report["regionalModelApproved"])
        self.assertFalse(report["archiveWrittenToDisk"])
        with zipfile.ZipFile(io.BytesIO(first)) as z:
            self.assertEqual(set(z.namelist()), p19.FILES)
            self.assertEqual(len(z.namelist()), len(p19.FILES))
            self.assertTrue(all(x.date_time == (2020, 1, 1, 0, 0, 0)
                                for x in z.infolist()))
            self.assertFalse(any(x.startswith(("scripts/", "training/", "data/",
                                "tests/", ".github/")) for x in z.namelist()))

    def test_extra_permissions_hosts_csp_or_experimental_model_fail(self):
        m = json.loads((ROOT / "manifest.json").read_text(encoding="utf8"))
        changes = [
            {"permissions": ["storage", "activeTab", "scripting"]},
            {"host_permissions": ["<all_urls>"]},
            {"content_security_policy": {"extension_pages": "script-src *"}},
            {"web_accessible_resources": [{"resources": ["data/*"], "matches": ["<all_urls>"]}]},
            {"content_scripts": [{**m["content_scripts"][0],
               "js": [*m["content_scripts"][0]["js"],
                      "data/p16-demo-ci-candidate.json"]}]},
            {"content_scripts": [{**m["content_scripts"][0], "all_frames": False}]}
        ]
        for update in changes:
            with self.subTest(update=update), self.assertRaises(ValueError):
                p19.validate_manifest({**copy.deepcopy(m), **update})

    def test_popup_refs_cannot_be_remote_inline_or_embedded(self):
        original = (ROOT / "popup/index.html").read_text(encoding="utf8")
        self.assertTrue(p19.validate_popup(original))
        for altered in [
            original.replace('src="popup.js"', 'src="https://example.com/a.js"'),
            original.replace('src="popup.js"', 'src="../training/a.js"'),
            original.replace('src="popup.js" defer', 'src="popup.js">alert(1)'),
            original.replace('href="popup.css"', 'href="//example.com/a.css"'),
            original.replace('</head>', '<iframe src="https://example.com"></iframe></head>')
        ]:
            with self.assertRaises(ValueError):
                p19.validate_popup(altered)

    def test_runtime_source_filters_executable_remote_code_and_bad_png(self):
        for name, data in [
            ("content/neural.js", b"fetch('https://example.com')"),
            ("popup/popup.js", b"eval('x')"),
            ("popup/popup.css", b"@import 'https://example.com';"),
            ("icons/icon-16.png", b"not a PNG")
        ]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                p19.validate_source(name, data)

    def test_missing_script_cannot_be_hidden_from_runtime_package(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "manifest.json").write_bytes(
                (ROOT / "manifest.json").read_bytes())
            with self.assertRaisesRegex(ValueError, "missing"):
                p19.create_preview(root)


if __name__ == "__main__":
    unittest.main()
