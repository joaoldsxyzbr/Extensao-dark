"""P7: treino experimental 57D -> RGB com Neural Core P15, sem publicar pesos."""
import argparse
import json
import math
from pathlib import Path

from vendor.neural_core.training.network import create_network, predict
from vendor.neural_core.training.train import train
from vendor.neural_core.training.export import save_model

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "training/neural-color-features.json"
DEPLOYED = (ROOT / "data/neural-model.json").resolve()
INPUT_SIZE = 57
OUTPUT_SIZE = 7
SEED = 20261026
ALLOWED_SPLITS = ("train", "validation", "holdout", "stress")


def validate_sample(row):
    if not isinstance(row, dict) or row.get("split") not in ALLOWED_SPLITS:
        raise ValueError("Split P7 inválido")
    for key, width in (("x", INPUT_SIZE), ("y", OUTPUT_SIZE)):
        vector = row.get(key)
        if not isinstance(vector, list) or len(vector) != width or any(
            type(value) not in (float, int) or
            not math.isfinite(value) or not 0 <= value <= 1 for value in vector
        ):
            raise ValueError("Vetor P7 inválido: " + key)
    if row["y"][0] not in (0, 1) or row["split"] == "stress" and row.get("profile") != "css-stress-unseen":
        raise ValueError("Rótulo ou perfil stress inválido")
    if row["split"] != "stress" and row.get("profile") == "css-stress-unseen":
        raise ValueError("Perfil stress vazou para treino/avaliação")
    if not isinstance(row.get("group"), str) or not row["group"]:
        raise ValueError("Família visual ausente")


def load_dataset(file=DATA):
    data = json.loads(Path(file).read_text(encoding="utf8"))
    if not isinstance(data, dict) or data.get("formatVersion") != 1 or (
        data.get("origin") != "synthetic-design-tokens-not-real-websites" or
        data.get("featureCount") != INPUT_SIZE or data.get("outputCount") != OUTPUT_SIZE or
        not isinstance(data.get("samples"), list)
    ):
        raise ValueError("Dataset neural de cores desconhecido")
    grouped = {name: [] for name in ALLOWED_SPLITS}
    ids = set()
    families = {}
    for row in data["samples"]:
        validate_sample(row)
        sample_id = row.get("id")
        if not isinstance(sample_id, str) or not sample_id or sample_id in ids:
            raise ValueError("ID P7 duplicado/inválido")
        ids.add(sample_id)
        split = row["split"]
        if split != "stress":
            if row["group"] in families and families[row["group"]] != split:
                raise ValueError("Vazamento de família entre splits P7")
            families[row["group"]] = split
        grouped[split].append(row)
    if [len(grouped[split]) for split in ALLOWED_SPLITS] != [756, 252, 252, 630] or len(families) != 30:
        raise ValueError("Contagem do conjunto P7 alterada")
    return grouped


def make_network(seed=SEED):
    return create_network([INPUT_SIZE, 12, OUTPUT_SIZE], ["tanh", "sigmoid"], seed=seed)


def measure(model, rows):
    positives = 0
    false_positives = 0
    false_negatives = 0
    rgb_errors = 0.0
    rgb_channels = 0
    for row in rows:
        prediction = predict(model, row["x"])
        if len(prediction) != OUTPUT_SIZE or not all(math.isfinite(v) for v in prediction):
            raise ValueError("Inferência P7 inválida")
        expected = bool(row["y"][0])
        actual = prediction[0] >= 0.65
        positives += int(expected)
        false_positives += int(actual and not expected)
        false_negatives += int(not actual and expected)
        if expected:
            rgb_errors += sum(abs(a - b) for a, b in zip(prediction[1:], row["y"][1:]))
            rgb_channels += 6
    return {
        "total": len(rows), "positives": positives,
        "falsePositives": false_positives, "falseNegatives": false_negatives,
        "rgbMAE": round(rgb_errors / rgb_channels, 5) if rgb_channels else None
    }


def safe_output(value):
    target = Path(value).resolve()
    if target == DEPLOYED or target.name in ("neural-model.json", "neural-model-previous.json"):
        raise ValueError("Não é permitido sobrescrever os pesos publicados")
    if target == DATA.resolve() or target.suffix != ".json":
        raise ValueError("Destino do candidato inválido")
    return target


def run_training(*, epochs=5, dataset=DATA, seed=SEED):
    if type(epochs) is not int or not 1 <= epochs <= 30:
        raise ValueError("Epochs P7 fora do limite experimental")
    grouped = load_dataset(dataset)
    samples = [(row["x"], row["y"]) for row in grouped["train"]]
    network = make_network(seed)
    result = train(network, samples, epochs=epochs, learning_rate=0.02,
                   batch_size=16, optimizer="adamw", weight_decay=0.001,
                   loss="mse", seed=seed)
    return network, {
        "kind": "neural-color-synthetic-candidate-not-deployed",
        "architecture": [57, 12, 7],
        "epochs": epochs, "seed": seed, "loss": result,
        "train": measure(network, grouped["train"]),
        "validation": measure(network, grouped["validation"]),
        "holdout": measure(network, grouped["holdout"]),
        "stress": measure(network, grouped["stress"]),
        "promotionEligible": False,
        "reason": "Não há dados reais independentes, revisão visual nem gate de qualidade aprovado",
    }


def main():
    parser = argparse.ArgumentParser(description="P7: modelo experimental que prevê RGB, não implantado")
    parser.add_argument("--data", type=Path, default=DATA)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metrics", type=Path)
    parser.add_argument("--epochs", type=int, default=5)
    args = parser.parse_args()
    destination = safe_output(args.output)
    if args.metrics and args.metrics.resolve() in (destination, DEPLOYED):
        raise ValueError("Métricas não podem substituir pesos/modelos")
    network, metrics = run_training(epochs=args.epochs, dataset=args.data)
    destination.parent.mkdir(parents=True, exist_ok=True)
    save_model(network, destination)
    if args.metrics:
        args.metrics.parent.mkdir(parents=True, exist_ok=True)
        args.metrics.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps(metrics, ensure_ascii=False))


if __name__ == "__main__":
    main()
