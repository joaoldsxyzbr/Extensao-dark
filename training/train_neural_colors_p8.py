"""P8: duplo modelo neural para decisão BCE e geração RGB MSE.

Esta etapa só usa treino e validação para parâmetros/limiar. Nunca treina
com holdout ou stress e nunca modifica dados/pesos publicados.
"""
import argparse
import json
import math
import os
from pathlib import Path
import tempfile

from vendor.neural_core.training.network import create_network, predict
from vendor.neural_core.training.export import export_model
from vendor.neural_core.training.train import train
from training.train_neural_colors import DATA, safe_output, load_dataset

ROOT = Path(__file__).resolve().parents[1]
KIND = "neural-color-twohead-experimental-v1"
INPUTS = 57
SEED = 20261026


def select_threshold(model, validation):
    """Calibra no conjunto de validação, não no holdout.

    Score estritamente maior que o limiar: igualdade preserva o elemento.
    """
    negatives = [predict(model, row["x"])[0] for row in validation if row["y"][0] == 0]
    if not negatives:
        raise ValueError("Validação requer exemplos negativos")
    if any(not math.isfinite(p) or p < 0 or p > 1 for p in negatives):
        raise ValueError("Scores da validação inválidos")
    return max(0.65, max(negatives))


def measure(models, rows, threshold):
    classifier, rgb_model = models
    fp = fn = tp = tn = 0
    err = channels = 0
    per_family = {}
    for row in rows:
        score = predict(classifier, row["x"])[0]
        color = predict(rgb_model, row["x"])
        if not math.isfinite(score) or any(not math.isfinite(v) for v in color):
            raise ValueError("Inferência P8 inválida")
        expected = row["y"][0] == 1
        actual = score > threshold
        family = per_family.setdefault(row["group"], {"fp": 0, "fn": 0, "total": 0})
        family["total"] += 1
        if actual and expected:
            tp += 1
        elif actual:
            fp += 1
            family["fp"] += 1
        elif expected:
            fn += 1
            family["fn"] += 1
        else:
            tn += 1
        if expected:
            err += sum(abs(a - b) for a, b in zip(color, row["y"][1:]))
            channels += 6
    return {"total": len(rows), "tp": tp, "tn": tn, "fp": fp, "fn": fn,
            "rgbMAE": round(err / channels, 5) if channels else None,
            "families": per_family}


def audit_feature_overlap(grouped):
    """Analisa ambiguidade estrutural sem rótulos de sites ou holdout no treino."""
    train = {}
    contradictory_train = 0
    for row in grouped["train"]:
        key = tuple(row["x"])
        if key in train and train[key] != row["y"][0]:
            contradictory_train += 1
        train[key] = row["y"][0]
    return {"trainingContradictions": contradictory_train,
            "trainDistinctVectors": len(train),
            "overlap": {split: sum(tuple(row["x"]) in train for row in grouped[split])
                        for split in ("validation", "holdout", "stress")}}


def run_training(*, epochs=8, seed=SEED, data=DATA):
    if type(epochs) is not int or not 1 <= epochs <= 25:
        raise ValueError("Épocas P8 fora do limite")
    grouped = load_dataset(data)
    train_rows = grouped["train"]
    classifier = create_network([INPUTS, 16, 1], ["tanh", "sigmoid"], seed=seed)
    rgb = create_network([INPUTS, 16, 6], ["tanh", "sigmoid"], seed=seed + 1)

    cls_samples = [(r["x"], [r["y"][0]]) for r in train_rows]
    rgb_samples = [(r["x"], r["y"][1:]) for r in train_rows if r["y"][0] == 1]
    if len(rgb_samples) < 30:
        raise ValueError("Treino P8 sem positivos suficientes")
    cls_loss = train(classifier, cls_samples, epochs=epochs, batch_size=16,
                     optimizer="adamw", loss="bce", learning_rate=0.015,
                     weight_decay=0.001, seed=seed)
    rgb_loss = train(rgb, rgb_samples, epochs=epochs, batch_size=16,
                     optimizer="adamw", loss="mse", learning_rate=0.02,
                     weight_decay=0.001, seed=seed + 1)
    # P8: seleção de limiar feita unicamente em validação.
    threshold = select_threshold(classifier, grouped["validation"])
    candidate = {"formatVersion": 1, "kind": KIND, "featureCount": INPUTS,
                 "threshold": threshold,
                 "heads": {"apply": export_model(classifier), "rgb": export_model(rgb)}}
    audit = audit_feature_overlap(grouped)
    scores = {split: measure((classifier, rgb), rows, threshold)
              for split, rows in grouped.items()}
    metrics = {"kind": KIND, "seed": seed, "epochs": epochs,
               "thresholdSource": "validation-negative-max",
               "threshold": threshold,
               "trainingRows": len(cls_samples),
               "rgbPositiveTrainRows": len(rgb_samples),
               "classifierLoss": cls_loss, "rgbLoss": rgb_loss,
               "featureAudit": audit, "splits": scores,
               "promotionEligible": False,
               "reason": "Holdout sintético e CSS stress não provam generalização em sites reais"}
    return candidate, metrics


def atomic_json(data, destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf8", delete=False,
                                        dir=destination.parent, prefix=".p8-",
                                        suffix=".tmp") as stream:
            temp = Path(stream.name)
            json.dump(data, stream, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, destination)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description="P8: treino neural de duas cabeças sem deploy")
    parser.add_argument("--input", type=Path, default=DATA)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metrics", type=Path)
    parser.add_argument("--epochs", type=int, default=8)
    args = parser.parse_args()
    target = safe_output(args.output)
    if args.metrics:
        metrics_path = safe_output(args.metrics)
        if target == metrics_path:
            raise ValueError("Não sobrescrever candidato com relatório")
    candidate, metrics = run_training(epochs=args.epochs, data=args.input)
    atomic_json(candidate, target)
    if args.metrics:
        atomic_json(metrics, metrics_path)
    # Metadados legíveis, sem lista de amostras nem conteúdo sensível.
    print(json.dumps(metrics, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
