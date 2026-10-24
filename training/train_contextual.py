"""P2: treinamento contextual SUPERVISIONADO sobre políticas sintéticas locais.

Treina somente um candidato, não modifica data/neural-model.json. Os 18
atributos provêm do mesmo extrator JavaScript que roda na extensão.
"""
import argparse
import json
import math
from collections import Counter
from pathlib import Path

from vendor.neural_core.training.network import create_network, predict
from vendor.neural_core.training.train import train
from vendor.neural_core.training.export import save_model

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "training" / "contextual-features.json"
SPLITS = ("train", "validation", "holdout")
SEED = 20261024
THRESHOLD = .80


def load_cases(path=DATA):
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    if document.get("formatVersion") != 2 or document.get("featureCount") != 18:
        raise ValueError("Contrato P2 incompatível")
    if document.get("origin") != "curated-synthetic-policy":
        raise ValueError("Origem do dataset desconhecida")
    cases = document.get("samples")
    if not isinstance(cases, list) or len(cases) != 2520:
        raise ValueError("Quantidade de exemplos P2 inválida")
    groups = {name: [] for name in SPLITS}
    families = {}
    ids = set()
    for row in cases:
        if not isinstance(row, dict):
            raise ValueError("Exemplo inválido")
        sample_id = row.get("id")
        family, split = row.get("group"), row.get("split")
        x, y = row.get("x"), row.get("y")
        if not isinstance(sample_id, str) or sample_id in ids:
            raise ValueError("ID ausente/duplicado")
        ids.add(sample_id)
        if split not in groups or not isinstance(family, str) or not family:
            raise ValueError("Grupo ou split inválido")
        if family in families and families[family] != split:
            raise ValueError("Vazamento: família presente em vários splits")
        families[family] = split
        if not isinstance(x, list) or len(x) != 18 or any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or
            not math.isfinite(v) or not 0 <= v <= 1 for v in x
        ):
            raise ValueError("Vetor inválido")
        if not isinstance(y, list) or len(y) != 1 or type(y[0]) is not int or y[0] not in (0, 1):
            raise ValueError("Rótulo inválido")
        if row.get("policy") not in ("convert", "preserve", "contrast"):
            raise ValueError("Política sem aprovação")
        if row["policy"] != "convert" and y[0]:
            raise ValueError("Um elemento protegido foi rotulado para transformação")
        groups[split].append(row)
    counts = Counter(families.values())
    if len(families) != 30 or counts != Counter(train=18, validation=6, holdout=6):
        raise ValueError("Grupos P2 alterados")
    for split in SPLITS:
        if not any(row["y"][0] == 1 for row in groups[split]):
            raise ValueError("Split sem positivos: " + split)
        if not any(row["y"][0] == 0 for row in groups[split]):
            raise ValueError("Split sem negativos: " + split)
    return groups


def evaluate(model, rows):
    tp = tn = fp = fn = 0
    for row in rows:
        actual = predict(model, row["x"])[0] >= THRESHOLD
        expected = row["y"][0] == 1
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
        "total": total, "tp": tp, "tn": tn, "fp": fp, "fn": fn,
        "accuracy": round((tp + tn) / total, 4),
        "precision": round(tp / (tp + fp), 4) if tp + fp else 0,
        "recall": round(tp / (tp + fn), 4) if tp + fn else 0,
    }


def run_training(*, epochs=65, seed=SEED, path=DATA):
    groups = load_cases(path)
    # Treino somente: balanceamento moderado de positivos, sem criar dados
    # de validação/holdout por aumento ou reutilização.
    selected = [row for row in groups["train"] if row.get("size") != "large"]
    examples = [(row["x"], row["y"]) for row in selected]
    examples += [(row["x"], row["y"]) for row in selected if row["y"][0]]
    legacy = json.loads(Path(path).read_text(encoding="utf-8")).get("legacyTrain")
    if not isinstance(legacy, list) or len(legacy) != 82:
        raise ValueError("Âncoras legadas não podem incluir validation/holdout")
    for row in legacy:
        if (row.get("split") != "train" or row.get("source") != "legacy-train-only" or
                not isinstance(row.get("x"), list) or len(row["x"]) != 18 or
                not isinstance(row.get("y"), list) or row["y"][0] not in (0, 1)):
            raise ValueError("Linha de legado indevida")
    # Balanceamento de domínio apenas com exemplos LEGADOS do treino.
    # Os 18+32 casos antigos de avaliação não entram nas atualizações.
    examples += [(row["x"], row["y"]) for row in legacy] * 3
    network = create_network([18, 14, 1], ["tanh", "sigmoid"], seed=seed)
    loss = train(network, examples, epochs=epochs, learning_rate=.24, seed=seed)
    results = {
        "kind": "synthetic-candidate-not-deployed",
        "seed": seed, "dimensions": [18, 14, 1],
        "trainingFamilies": 18, "trainingUniqueSamples": len(selected),
        "legacyTrainingAnchors": len(legacy),
        "trainingUpdatesPerEpoch": len(examples),
        "epochs": epochs, "loss": loss,
        "validation": evaluate(network, groups["validation"]),
        "holdout": evaluate(network, groups["holdout"]),
    }
    return network, results


def main():
    parser = argparse.ArgumentParser(description="Treino contextual P2 offline")
    parser.add_argument("--output", type=Path, required=True, help="Caminho somente do CANDIDATO")
    parser.add_argument("--metrics", type=Path, help="Relatório de métricas")
    parser.add_argument("--epochs", type=int, default=65)
    args = parser.parse_args()
    candidate, metrics = run_training(epochs=args.epochs)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    save_model(candidate, args.output)
    if args.metrics:
        args.metrics.parent.mkdir(parents=True, exist_ok=True)
        args.metrics.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False))


if __name__ == "__main__":
    main()
