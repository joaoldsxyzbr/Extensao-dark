"""Regressões de treino separado, exportação e ausência de vazamento."""
import json
import unittest

from training.train_dark import (
    ROOT, augmented_training, evaluate, load_cases, run_training,
)
from vendor.neural_core.training.export import export_model


class DarkModelTests(unittest.TestCase):
    def test_splits_disjuntos_e_features(self):
        training, validation, holdout = load_cases()
        self.assertGreaterEqual(len(training), 50)
        self.assertGreaterEqual(len(validation), 15)
        self.assertGreaterEqual(len(holdout), 25)
        for x, y in training + validation + holdout:
            self.assertEqual(len(x), 7)
            self.assertEqual(y[0] in (0, 1), True)
            self.assertTrue(all(0 <= value <= 1 for value in x))

    def test_jitter_nao_muda_flags_nem_labels(self):
        training, validation, holdout = load_cases()
        augmented = augmented_training(training, copies=2)
        self.assertEqual(len(augmented), 3 * len(training))
        for x, y in augmented:
            self.assertTrue(0 <= min(x) and max(x) <= 1)
            self.assertIn((x[5], x[6]), [(0, 0), (1, 0), (1, 1)])
            self.assertIn(y[0], (0, 1))
        self.assertEqual(augmented_training(training), augmented_training(training))
        self.assertEqual(len(validation), len(load_cases()[1]))
        self.assertEqual(len(holdout), len(load_cases()[2]))

    def test_modelo_distribuido_valido(self):
        source = json.loads((ROOT / "data/neural-model.json").read_text(encoding="utf-8"))
        model = export_model(source)
        self.assertEqual([layer["inputSize"] for layer in model["layers"]], [7, 12])
        self.assertEqual([layer["outputSize"] for layer in model["layers"]], [12, 1])

    def test_treino_offline_nao_substitui_pesos(self):
        original = (ROOT / "data/neural-model.json").read_bytes()
        candidate, metrics = run_training(35)
        self.assertLess(metrics["finalLoss"], metrics["initialLoss"])
        self.assertEqual(export_model(candidate)["formatVersion"], 1)
        self.assertEqual((ROOT / "data/neural-model.json").read_bytes(), original)
        self.assertEqual(metrics["validation"]["total"], len(load_cases()[1]))
        self.assertEqual(metrics["holdout"]["total"], len(load_cases()[2]))


if __name__ == "__main__":
    unittest.main()
