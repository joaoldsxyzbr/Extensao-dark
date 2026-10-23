"""Treinamento OFFLINE da Extensão Dark com o motor universal versionado.

Este arquivo é específico da extensão; vendor/neural_core permanece genérico.
A execução padrão testa o aprendizado sem substituir o modelo distribuído.
Use --output caminho.json para gerar um candidato explicitamente.
"""
import argparse
import json
from pathlib import Path

from vendor.neural_core.training.network import create_network, predict
from vendor.neural_core.training.train import train
from vendor.neural_core.training.export import save_model

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "training" / "neural-features.json"


def load_cases():
    document = json.loads(DATA.read_text(encoding="utf-8"))
    if document.get("formatVersion") != 1:
        raise ValueError("Versão dos dados inválida")
    cases = document["samples"]
    if len({case["id"] for case in cases}) != len(cases):
        raise ValueError("IDs de cenário repetidos")
    train_cases = [(case["x"], case["y"]) for case in cases if case["split"] == "train"]
    holdout = [(case["x"], case["y"]) for case in cases if case["split"] == "holdout"]
    if len(train_cases) < 20 or len(holdout) < 10:
        raise ValueError("Divisão de treino e avaliação insuficiente")
    return train_cases, holdout


def run_training(epochs=250):
    training, holdout = load_cases()
    network = create_network([7, 12, 1], ["tanh", "sigmoid"], seed=20261023)
    metrics = train(network, training, epochs=epochs, learning_rate=0.35, seed=20261023)
    if not metrics["finalLoss"] < metrics["initialLoss"]:
        raise ValueError("O treinamento não reduziu o erro")
    total = correct = false_positive = false_negative = 0
    for features, label in holdout:
        expected = label[0] == 1
        observed = predict(network, features)[0] >= 0.80
        total += 1
        correct += int(observed == expected)
        false_positive += int(observed and not expected)
        false_negative += int(expected and not observed)
    return network, {
        **metrics, "holdoutTotal": total, "holdoutAccuracy": correct / total,
        "falsePositives": false_positive, "falseNegatives": false_negative
    }


def main():
    parser = argparse.ArgumentParser(description="Treina um modelo candidato sem alterar a extensão automaticamente")
    parser.add_argument("--output", type=Path, help="Arquivo de destino para um modelo candidato (não altera o modelo distribuído)")
    parser.add_argument("--epochs", type=int, default=250)
    args = parser.parse_args()
    network, metrics = run_training(args.epochs)
    if args.output:
        save_model(network, args.output)
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
