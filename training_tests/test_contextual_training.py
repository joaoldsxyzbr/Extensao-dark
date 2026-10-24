"""Validação de integridade e reprodutibilidade do treino contextual P2."""
import json
import tempfile
import unittest
from pathlib import Path

from training.train_contextual import DATA, load_cases, run_training
from vendor.neural_core.training.export import export_model


class ContextualTrainingTests(unittest.TestCase):
    def test_splits_disjuntos_e_positivos_em_todos(self):
        groups = load_cases()
        self.assertEqual([len(groups[name]) for name in ("train","validation","holdout")],
                         [1512,504,504])
        known = {}
        for split, rows in groups.items():
            self.assertTrue(any(row["y"][0] for row in rows), split)
            self.assertTrue(any(not row["y"][0] for row in rows), split)
            for row in rows:
                self.assertEqual(len(row["x"]),18)
                self.assertNotIn(row["group"], {name for name,old in known.items()
                                               if old != split})
                known[row["group"]] = split

    def test_contratos_invalidos_rejeitados(self):
        data = json.loads(DATA.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory)/"invalid.json"
            wrong = json.loads(json.dumps(data))
            wrong["samples"][0]["x"].append(0)
            file.write_text(json.dumps(wrong))
            with self.assertRaisesRegex(ValueError,"Vetor"):
                load_cases(file)
            wrong = json.loads(json.dumps(data))
            wrong["samples"][1]["group"] = wrong["samples"][-1]["group"]
            file.write_text(json.dumps(wrong))
            with self.assertRaisesRegex(ValueError,"Vazamento"):
                load_cases(file)

    def test_candidato_nao_modifica_modelo_distribuido(self):
        model_path=DATA.parent.parent/"data/neural-model.json"
        original=model_path.read_bytes()
        model,metrics=run_training(epochs=2)
        repeated,repeated_metrics=run_training(epochs=2)
        self.assertEqual(export_model(model),export_model(repeated))
        self.assertEqual(metrics,repeated_metrics)
        self.assertEqual(export_model(model)["layers"][0]["inputSize"],18)
        self.assertLess(metrics["loss"]["finalLoss"],metrics["loss"]["initialLoss"])
        self.assertEqual(model_path.read_bytes(),original)


if __name__ == "__main__":
    unittest.main()
