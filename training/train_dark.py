"""Treinamento supervisionado offline da Extensão Dark, usando Neural Core fixo.

O motor em vendor/ nunca é modificado. Somente o split 'train' recebe
variações numéricas pequenas; validation e holdout ficam intactos.
O comando não altera pesos distribuídos sem --output explícito.
"""
import argparse
import json
import random
from pathlib import Path

from vendor.neural_core.training.network import create_network, predict
from vendor.neural_core.training.train import train
from vendor.neural_core.training.export import export_model, save_model

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "training" / "neural-features.json"
THRESHOLD = 0.80
SEED = 20261023


def load_cases():
    document = json.loads(DATA.read_text(encoding="utf-8"))
    if document.get("formatVersion") != 1:
        raise ValueError("Versão dos dados inválida")
    cases = document.get("samples")
    if not isinstance(cases, list):
        raise ValueError("Amostras ausentes")
    ids = set()
    splits = {"train": [], "validation": [], "holdout": []}
    for case in cases:
        if case["id"] in ids:
            raise ValueError("ID de cenário duplicado")
        ids.add(case["id"])
        split = case.get("split")
        if split not in splits:
            raise ValueError("Split inválido")
        x, y = case["x"], case["y"]
        if len(x) != 7 or len(y) != 1 or y[0] not in (0, 1):
            raise ValueError("Características ou rótulo inválidos")
        if any(not 0 <= float(value) <= 1 for value in x):
            raise ValueError("Características fora de [0,1]")
        splits[split].append((x, y))
    if len(splits["train"]) < 50 or len(splits["validation"]) < 15 or len(splits["holdout"]) < 25:
        raise ValueError("Divisão insuficiente ou comprometida")
    return splits["train"], splits["validation"], splits["holdout"]


def augmented_training(training, *, seed=SEED, copies=2):
    """Jitter leve apenas nas 5 características contínuas dos cenários train.

    Não cria novas evidências independentes, não muda o rótulo nem os flags
    de controle/seleção. Não é garantia de generalização para sites reais.
    """
    rng = random.Random(seed)
    samples = [(x[:], y[:]) for x, y in training]
    widths = [0.009, 0.009, 0.0, 0.012, 0.009]
    for x, y in training:
        for _ in range(copies):
            jittered = [
                max(0.0, min(1.0, value + rng.uniform(-width, width)))
                for value, width in zip(x[:5], widths)
            ]
            samples.append((jittered + x[5:], y[:]))
    return samples


def evaluate(model, cases):
    tp = tn = fp = fn = 0
    for x, label in cases:
        actual = predict(model, x)[0] >= THRESHOLD
        expected = bool(label[0])
        if actual and expected:
            tp += 1
        elif not actual and not expected:
            tn += 1
        elif actual:
            fp += 1
        else:
            fn += 1
    total = tp + tn + fp + fn
    return {
        "total": total, "accuracy": round((tp + tn) / total, 4),
        "precision": round(tp / (tp + fp), 4) if tp + fp else 0,
        "recall": round(tp / (tp + fn), 4) if tp + fn else 0,
        "tp": tp, "tn": tn, "fp": fp, "fn": fn,
    }


def run_training(epochs=220, *, seed=SEED):
    training, validation, holdout = load_cases()
    data = augmented_training(training, seed=seed)
    network = create_network([7, 12, 1], ["tanh", "sigmoid"], seed=seed)
    losses = train(network, data, epochs=epochs, learning_rate=0.30, seed=seed)
    if not losses["finalLoss"] < losses["initialLoss"]:
        raise ValueError("O treinamento não reduziu o erro")
    metrics = {
        **losses,
        "trainingScenarios": len(training),
        "augmentedSamples": len(data),
        "validation": evaluate(network, validation),
        "holdout": evaluate(network, holdout),
    }
    return network, metrics


def main():
    parser = argparse.ArgumentParser(description="Treina candidato neural offline")
    parser.add_argument("--output", type=Path, help="Exporta candidato; não altera pesos implantados automaticamente")
    parser.add_argument("--epochs", type=int, default=220)
    parser.add_argument("--print-model", action="store_true", help="Imprime pesos numéricos para auditoria no CI")
    args = parser.parse_args()
    network, metrics = run_training(args.epochs)
    if args.output:
        save_model(network, args.output)
    print(json.dumps(metrics, ensure_ascii=False, separators=(",", ":")))
    if args.print_model:
        print("MODEL_JSON=" + json.dumps(export_model(network), separators=(",", ":")))


if __name__ == "__main__":
    main()
