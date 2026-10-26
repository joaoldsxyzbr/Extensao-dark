"""P11: treina uma rede leve para sugerir cores de textos descendentes.

Professor: rótulos sintéticos locais de contraste. Não usa dados ou rótulos
dos sites já avaliados (Wikipedia, MDN, GitHub, etc.). Sem publicação de pesos.
"""
import argparse
import json
import math
from pathlib import Path

from vendor.neural_core.training.network import create_network, predict
from vendor.neural_core.training.export import export_model
from vendor.neural_core.training.train import train
from training.train_neural_colors_p8 import atomic_json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "training/p11-descendant-features.json"
OUTPUT = ROOT / "data/p11-descendant-ci-candidate.json"
METRICS = ROOT / "data/p11-descendant-ci-metrics.json"
KIND = "p11-neural-descendant-rgb-experimental-v1"
ORIGIN = "p11-synthetic-descendant-contrast-teacher-not-websites"
FAMILIES = {
    "train": {"cards", "tables", "dialog", "form", "menus"},
    "validation": {"feed", "notes"},
    "holdout": {"reading", "settings"},
}
SEED = 20261027


def load_dataset(filename=DATA):
    document = json.loads(Path(filename).read_text(encoding="utf8"))
    if (document.get("formatVersion") != 1 or document.get("origin") != ORIGIN or
            document.get("inputCount") != 12 or document.get("outputCount") != 3 or
            not isinstance(document.get("samples"), list)):
        raise ValueError("Contrato de corpus P11 inválido")
    grouped = {split: [] for split in FAMILIES}
    ids = set()
    seen = {split: set() for split in FAMILIES}
    for sample in document["samples"]:
        if not isinstance(sample, dict) or sample.get("split") not in grouped:
            raise ValueError("Split P11 inválido")
        split = sample["split"]
        if (not isinstance(sample.get("id"), str) or sample["id"] in ids or
            sample.get("family") not in FAMILIES[split]):
            raise ValueError("ID/família P11 inválido")
        ids.add(sample["id"])
        for name, count in (("x", 12), ("y", 3)):
            values = sample.get(name)
            if (not isinstance(values, list) or len(values) != count or
                any(type(v) not in (int, float) or not math.isfinite(v)
                    or not 0 <= v <= 1 for v in values)):
                raise ValueError("Vetor P11 inválido")
        grouped[split].append(sample)
        seen[split].add(sample["family"])
    if seen != FAMILIES or len(ids) != 2592 or any(
            len(grouped[split]) != len(FAMILIES[split]) * 288 for split in FAMILIES):
        raise ValueError("P11: contagem/famílias alteradas")
    keys = {split: {tuple(row["x"]) for row in rows} for split, rows in grouped.items()}
    if any(keys[a] & keys[b] for a in keys for b in keys if a != b):
        raise ValueError("Vazamento de vetores P11")
    return grouped


def quality(model, rows):
    mae = 0.0
    below = 0
    changed = 0
    by_family = {}
    for row in rows:
        raw = predict(model, row["x"])
        if len(raw) != 3 or not all(math.isfinite(v) and 0 <= v <= 1 for v in raw):
            raise ValueError("Inferência P11 inválida")
        source = row["x"][3:6]
        predicted = [round(x * 255) for x in raw]
        bg = [round(x * 255) for x in row["x"][:3]]
        def luminance(rgb):
            linear = [s / 12.92 if s <= .04045 else ((s + .055) / 1.055) ** 2.4
                      for s in [v / 255 for v in rgb]]
            return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]
        top = max(luminance(predicted), luminance(bg))
        bottom = min(luminance(predicted), luminance(bg))
        contrast = (top + .05) / (bottom + .05)
        threshold = 3 if row["x"][10] == 1 else 4.5
        unsafe = contrast < threshold
        below += int(unsafe)
        changed += int(any(abs(raw[i] - source[i]) > .04 for i in range(3)))
        mae += sum(abs(a - b) for a, b in zip(raw, row["y"]))
        family = by_family.setdefault(row["family"], {"total": 0, "unsafe": 0})
        family["total"] += 1
        family["unsafe"] += int(unsafe)
    return {"total": len(rows), "rgbMAE": round(mae / (3 * len(rows)), 5),
            "unsafeColorProposals": below, "proposedChanges": changed,
            "families": by_family}


def select_best(options):
    """Escolhe pela validação APENAS. Nunca lê métricas do holdout."""
    if not isinstance(options, list) or not options:
        raise ValueError("P11: validação sem candidatos")
    for option in options:
        if (not isinstance(option, dict) or
            type(option.get("epochs")) is not int or option["epochs"] < 1 or
            not isinstance(option.get("validation"), dict)):
            raise ValueError("P11: validação inválida")
        validation = option["validation"]
        unsafe = validation.get("unsafeColorProposals")
        mae = validation.get("rgbMAE")
        if (type(unsafe) is not int or unsafe < 0 or
            type(mae) not in (int, float) or not math.isfinite(mae) or mae < 0):
            raise ValueError("P11: validação inválida")
    return min(options, key=lambda row: (
        row["validation"]["unsafeColorProposals"],
        row["validation"]["rgbMAE"],
        row["epochs"],
    ))


def train_candidate(*, epochs=12, data=DATA, seed=SEED):
    if type(epochs) is not int or not 1 <= epochs <= 30:
        raise ValueError("Épocas P11 inválidas")
    grouped = load_dataset(data)
    pairs = [(row["x"], row["y"]) for row in grouped["train"]]
    # Candidatos predefinidos antes dos testes; a opção original de 12 épocas
    # sempre participa. Holdout não é consultado durante a seleção.
    candidate_epochs = [8, 12, 16] if epochs == 12 else [epochs]
    options = []
    for candidate_epochs_count in candidate_epochs:
        network = create_network([12, 20, 3], ["tanh", "sigmoid"], seed=seed)
        fitting = train(network, pairs, epochs=candidate_epochs_count, batch_size=24,
                        optimizer="adamw", loss="mse", learning_rate=.02,
                        weight_decay=.0005, seed=seed)
        score = quality(network, grouped["validation"])
        options.append({"epochs": candidate_epochs_count,
                        "validation": score, "network": network, "loss": fitting})
    best = select_best(options)
    network = best["network"]
    # Somente o candidato escolhido é medido no holdout histórico. Como ele já
    # foi exposto em execuções anteriores, não constitui nova avaliação cega.
    scores = {
        "train": quality(network, grouped["train"]),
        "validation": best["validation"],
        "holdout": quality(network, grouped["holdout"]),
    }
    selection = {
        "basis": "validation-only",
        "candidateEpochs": candidate_epochs,
        "selectedEpochs": best["epochs"],
        "holdoutUsage": "final-report-only",
        "validationResults": [
            {"epochs": row["epochs"],
             "unsafeColorProposals": row["validation"]["unsafeColorProposals"],
             "rgbMAE": row["validation"]["rgbMAE"]}
            for row in options
        ],
    }
    candidate = {"formatVersion": 1, "kind": KIND, "featureCount": 12,
                 "outputCount": 3, "model": export_model(network)}
    metrics = {"kind": KIND, "origin": ORIGIN, "epochs": best["epochs"], "seed": seed,
               "architecture": [12, 20, 3], "loss": best["loss"],
               "selection": selection, "splits": scores,
               "familyIsolation": True, "teacher": "synthetic-contrast-rule",
               "promotionEligible": False,
               "reason": "Validação sintética para escolha; holdout já exposto e avaliações cegas de sites ainda inexistentes."}
    return candidate, metrics


def safe_target(filename):
    dest = Path(filename).resolve()
    data_dir = (ROOT / "data").resolve()
    if (dest.parent != data_dir or
        dest.name not in {OUTPUT.name, METRICS.name}):
        raise ValueError("P11: somente arquivos CI autorizados, nunca pesos de produção")
    return dest


def main():
    parser = argparse.ArgumentParser(description="P11: regressão neural RGB para textos descendentes")
    parser.add_argument("--data", type=Path, default=DATA)
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--metrics", type=Path, default=METRICS)
    args = parser.parse_args()
    out, report = safe_target(args.output), safe_target(args.metrics)
    if out == report or out != OUTPUT or report != METRICS:
        raise ValueError("P11: destinos CI trocados")
    candidate, metrics = train_candidate(epochs=args.epochs, data=args.data)
    atomic_json(candidate, out)
    atomic_json(metrics, report)
    print(json.dumps({"training": metrics["splits"]["train"],
                      "validation": metrics["splits"]["validation"],
                      "holdout": metrics["splits"]["holdout"],
                      "promotionEligible": False}, separators=(",", ":")))


if __name__ == "__main__":
    main()
