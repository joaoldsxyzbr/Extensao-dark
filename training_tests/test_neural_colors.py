"""P7: invariantes de segurança do treinamento experimental de cores."""
import unittest
from pathlib import Path

from training.train_neural_colors import (
    DEPLOYED, INPUT_SIZE, OUTPUT_SIZE, make_network, safe_output, validate_sample,
)
from vendor.neural_core.training.network import predict


class NeuralColorP7Tests(unittest.TestCase):
    def test_rede_multioutput_suporta_57_entradas(self):
        model = make_network()
        self.assertEqual((model["layers"][0]["inputSize"], model["layers"][-1]["outputSize"]),
                         (INPUT_SIZE, OUTPUT_SIZE))
        self.assertEqual(len(predict(model, [0.0] * INPUT_SIZE)), OUTPUT_SIZE)

    def test_nao_permite_publicacao_acidental(self):
        with self.assertRaisesRegex(ValueError, "publicados"):
            safe_output(DEPLOYED)
        with self.assertRaisesRegex(ValueError, "publicados"):
            safe_output(Path("/tmp/neural-model.json"))
        self.assertEqual(safe_output(Path("/tmp/p7-candidate.json")).suffix, ".json")

    def test_rejeita_exemplos_invalidos(self):
        row = {"split": "train", "group": "button", "profile": "css-basic",
               "x": [0.0] * INPUT_SIZE, "y": [1.0] + [0.1] * 6}
        validate_sample(row)
        with self.assertRaisesRegex(ValueError, "Vetor"):
            validate_sample({**row, "x": [0.0] * (INPUT_SIZE - 1)})
        with self.assertRaisesRegex(ValueError, "stress"):
            validate_sample({**row, "profile": "css-stress-unseen"})


if __name__ == "__main__":
    unittest.main()
