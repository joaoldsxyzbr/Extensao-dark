"""Valida decisões P8 em treino/validação e saída experimental isolada."""
import unittest

from training.train_neural_colors_p8 import select_threshold, audit_feature_overlap
from training.train_neural_colors import load_dataset, safe_output
from vendor.neural_core.training.network import create_network, predict


class NeuralColorP8Tests(unittest.TestCase):
    def test_limiar_escolhido_apenas_com_negativos_da_validacao(self):
        model = create_network([57, 1], ["sigmoid"], seed=4)
        validation = [
            {"x": [0.0]*57, "y": [0]},
            {"x": [1.0]*57, "y": [1]}
        ]
        threshold = select_threshold(model, validation)
        self.assertGreaterEqual(threshold, 0.65)
        self.assertFalse(predict(model, validation[0]["x"])[0] > threshold)

    def test_splits_e_treino_nao_sobrepoem_holdout(self):
        groups=load_dataset()
        audit=audit_feature_overlap(groups)
        self.assertEqual(audit["overlap"]["validation"], 0)
        self.assertEqual(audit["overlap"]["holdout"], 0)
        self.assertGreaterEqual(audit["trainDistinctVectors"], 1)

    def test_pesos_implantados_protegidos(self):
        with self.assertRaisesRegex(ValueError, "publicados"):
            safe_output("data/neural-model.json")


if __name__ == "__main__":
    unittest.main()
