"""P14: frozen experiment registry must not be mistaken for real labeled training data."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "training" / "datasets" / "p14-fixture-catalog.json"
KNOWN = ROOT / "training" / "datasets" / "p14-known-domains.json"
FROZEN = {
    "train": {"canvas", "navigation", "cards", "direct-text", "native-theme",
              "form", "table", "graphics", "layered"},
    "validation": {"gradient", "interactive-state", "responsive"},
    "holdout": {"shadow-open", "alpha-layers", "document"},
}


class P14DatasetContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        cls.known = json.loads(KNOWN.read_text(encoding="utf-8"))

    def test_split_membership_and_family_disjointness(self):
        rows = self.catalog["fixtures"]
        self.assertEqual(len(rows), 15)
        self.assertEqual(len({row["id"] for row in rows}), 15)
        for split, families in FROZEN.items():
            self.assertEqual({row["family"] for row in rows if row["split"] == split},
                             families)
        self.assertEqual(len({row["family"] for row in rows}), 15)
        self.assertFalse(self.catalog["releaseEligible"])
        self.assertIn("holdout-never-run-in-ci", self.catalog["splitPolicy"])

    def test_records_are_synthetic_unlabeled_and_private_free(self):
        self.assertEqual(self.catalog["origin"], "synthetic-authored-no-user-data")
        for row in self.catalog["fixtures"]:
            self.assertEqual(
                set(row),
                {"id", "split", "family", "kind", "theme", "background",
                 "foreground", "surface", "directText"},
            )
            for color in ("background", "foreground", "surface"):
                self.assertRegex(row[color], r"^#[0-9a-f]{6}$")
            self.assertNotIn("label", row)
            self.assertNotIn("url", row)
            self.assertNotIn("text", row)

    def test_known_diagnostics_not_blind(self):
        rows = self.known["domains"]
        self.assertEqual(len(rows), 12)
        self.assertEqual(len({item["domain"] for item in rows}), 12)
        self.assertTrue(all(item["status"] == "known-from-earlier-experiments"
                            for item in rows))
        self.assertIn("docs.python.org", {item["domain"] for item in rows})

    def test_targets_are_not_claimed_as_completed(self):
        self.assertEqual(self.catalog["targets"]["publicPages"], 120)
        self.assertEqual(self.catalog["targets"]["publicDomains"], 30)
        self.assertEqual(self.catalog["targets"]["unseenHoldoutPages"], 30)
        self.assertEqual(self.catalog["targets"]["unseenHoldoutDomains"], 10)
        self.assertEqual(self.catalog["schemaVersion"], 1)


    def test_public_domain_plan_is_unverified_and_disjoint(self):
        candidate_file = ROOT / "training" / "datasets" / "p14-public-domain-candidates.json"
        plan = json.loads(candidate_file.read_text(encoding="utf-8"))
        self.assertEqual(plan["kind"], "p14-public-domain-candidates-not-reviewed")
        self.assertFalse(plan["releaseEligible"])
        self.assertIn("no-network", plan["policy"])
        self.assertEqual(len(plan["domains"]), 30)
        roots = [row["rootDomain"] for row in plan["domains"]]
        self.assertEqual(len(set(roots)), 30)
        known = {row["domain"] for row in self.known["domains"]}
        for row in plan["domains"]:
            self.assertEqual(set(row), {"rootDomain", "host", "split", "review"})
            self.assertEqual(row["review"], "unverified-candidate")
            self.assertTrue(row["host"] == row["rootDomain"] or
                            row["host"].endswith("." + row["rootDomain"]))
            self.assertFalse(any(row["rootDomain"] == d or
                                 row["rootDomain"].endswith("." + d) or
                                 d.endswith("." + row["rootDomain"])
                                 for d in known))
        self.assertEqual(sum(x["split"] == "train" for x in plan["domains"]), 15)
        self.assertEqual(sum(x["split"] == "validation" for x in plan["domains"]), 5)
        self.assertEqual(sum(x["split"] == "holdout" for x in plan["domains"]), 10)


if __name__ == "__main__":
    unittest.main()
