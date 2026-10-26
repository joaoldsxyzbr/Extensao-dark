"""P11: garantias de splits, contrato e ausência de promoção de pesos."""
import json
import tempfile
import unittest
from pathlib import Path

from training.train_p11_descendant import (
    load_dataset, train_candidate, safe_target, OUTPUT, METRICS
)


class P11DescendantTests(unittest.TestCase):
    def test_group_isolation(self):
        grouped = load_dataset()
        self.assertEqual([len(grouped[key]) for key in ("train", "validation", "holdout")],
                         [1440, 576, 576])
        names = {key: {item["family"] for item in value} for key, value in grouped.items()}
        self.assertFalse(names["train"] & names["validation"])
        self.assertFalse(names["train"] & names["holdout"])
        self.assertFalse(names["validation"] & names["holdout"])

    def test_rejects_corrupt_input_and_leaking_split(self):
        grouped = load_dataset()
        all_rows = [*grouped["train"], *grouped["validation"], *grouped["holdout"]]
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / "data.json"
            file.write_text(json.dumps({
                "formatVersion": 1, "origin": "real-sites-trained", "inputCount": 12,
                "outputCount": 3, "samples": all_rows
            }), encoding="utf8")
            with self.assertRaisesRegex(ValueError, "Contrato"):
                load_dataset(file)
            all_rows[0] = {**all_rows[0], "family": "reading"}
            file.write_text(json.dumps({
                "formatVersion": 1,
                "origin": "p11-synthetic-descendant-contrast-teacher-not-websites",
                "inputCount": 12, "outputCount": 3, "samples": all_rows
            }), encoding="utf8")
            with self.assertRaisesRegex(ValueError, "família"):
                load_dataset(file)

    def test_candidate_not_deployed_and_inputs(self):
        with self.assertRaisesRegex(ValueError, "Épocas"):
            train_candidate(epochs=0)
        with self.assertRaisesRegex(ValueError, "somente arquivos CI"):
            safe_target(OUTPUT.parent / "neural-model.json")
        with self.assertRaisesRegex(ValueError, "somente arquivos CI"):
            safe_target(OUTPUT.parent.parent / "manifest.json")
        self.assertEqual(safe_target(OUTPUT), OUTPUT)
        self.assertEqual(safe_target(METRICS), METRICS)

    def test_small_training_export(self):
        candidate, metrics = train_candidate(epochs=1)
        self.assertEqual(candidate["kind"], "p11-neural-descendant-rgb-experimental-v1")
        self.assertEqual(candidate["model"]["layers"][0]["inputSize"], 12)
        self.assertEqual(candidate["model"]["layers"][-1]["outputSize"], 3)
        self.assertFalse(metrics["promotionEligible"])
        self.assertEqual(metrics["splits"]["holdout"]["total"], 576)


if __name__ == "__main__":
    unittest.main()
