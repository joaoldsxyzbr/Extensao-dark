"""Compatibilidade do Neural Core P15 sem alterar o classificador implantado."""
import unittest

from vendor.neural_core.training.export import get_capabilities, describe_model, export_model
from vendor.neural_core.training.network import create_network, predict
from vendor.neural_core.training.train import train


class NeuralCoreP15Tests(unittest.TestCase):
    def test_capacidades_e_softmax(self):
        capabilities = get_capabilities()
        self.assertEqual(capabilities["operators"], ["dense"])
        self.assertIn("softmax", capabilities["activations"])
        model = create_network([2, 3], ["softmax"], seed=5)
        result = predict(model, [0.2, 0.8])
        self.assertEqual(len(result), 3)
        self.assertAlmostEqual(sum(result), 1.0, places=6)
        self.assertEqual(describe_model(model)["outputSize"], 3)
        self.assertEqual(export_model(model)["formatVersion"], 1)

    def test_treino_adamw_em_candidato_separado(self):
        model = create_network([2, 1], ["sigmoid"], seed=6)
        cases = [([0.0, 0.0], [0.0]), ([1.0, 1.0], [1.0])]
        report = train(model, cases, epochs=8, learning_rate=0.05,
                       optimizer="adamw", loss="bce", batch_size=2, seed=3)
        self.assertLess(report["finalLoss"], report["initialLoss"])
        self.assertEqual(report["epochs"], 8)


if __name__ == "__main__":
    unittest.main()
