"""Validação local do treinamento específico e dos pesos empacotados."""
import json
import unittest
from pathlib import Path

from training.train_dark import ROOT, load_cases, run_training
from vendor.neural_core.training.export import export_model


class DarkModelTests(unittest.TestCase):
    def test_separate_scenarios_and_features(self):
        training, holdout = load_cases()
        self.assertGreaterEqual(len(training), 20)
        self.assertGreaterEqual(len(holdout), 10)
        for x, y in training + holdout:
            self.assertEqual(len(x), 7)
            self.assertEqual(len(y), 1)
            self.assertTrue(all(0 <= value <= 1 for value in x))

    def test_versioned_deployed_model(self):
        source = json.loads((ROOT / "data/neural-model.json").read_text(encoding="utf-8"))
        model = export_model(source)
        self.assertEqual([layer["inputSize"] for layer in model["layers"]], [7, 12])
        self.assertEqual([layer["outputSize"] for layer in model["layers"]], [12, 1])

    def test_offline_training_changes_only_candidate(self):
        original = (ROOT / "data/neural-model.json").read_bytes()
        candidate, stats = run_training(35)
        self.assertLess(stats["finalLoss"], stats["initialLoss"])
        self.assertEqual(export_model(candidate)["formatVersion"], 1)
        self.assertEqual((ROOT / "data/neural-model.json").read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
