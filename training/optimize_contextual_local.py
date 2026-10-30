"""Opt-in local optimizer for synthetic P2 18D training. NOT a P16 model."""
import argparse
import json
from pathlib import Path

from training.train_contextual import DATA, SEED, load_cases, evaluate, training_pairs
from vendor.neural_core.training.network import create_network
from vendor.neural_core.training.train import train

ROOT = Path(__file__).resolve().parents[1]
EXPERIMENTS = ROOT / "training" / "experiments"
STUDY_NAME = "extensao-dark-p2-validation-v1"


def safe_local_path(filename, suffix):
    """Block remote, production, parent traversal, symlinks and hidden outputs."""
    file = Path(filename)
    target = (file if file.is_absolute() else ROOT / file).resolve()
    if (target.parent != EXPERIMENTS.resolve() or target.suffix != suffix or
            target.name.startswith(".") or
            not target.stem.replace("-", "").replace("_", "").isalnum()):
        raise ValueError("P16: only local training/experiments files are allowed")
    return target


def validation_risk(metrics):
    if not isinstance(metrics, dict):
        raise ValueError("P16: invalid validation")
    values = [metrics.get(k) for k in ("tp", "tn", "fp", "fn", "total")]
    if any(type(v) is not int or v < 0 for v in values):
        raise ValueError("P16: invalid validation counts")
    tp, tn, fp, fn, total = values
    if total < 1 or tp + tn + fp + fn != total or tp + fn < 1:
        raise ValueError("P16: invalid validation coverage")
    return float(20 * fp + fn + (1000 if tp / (tp + fn) < 0.6 else 0))


def optimize_local(*, n_trials=3, sqlite=None, optuna_module=None):
    if type(n_trials) is not int or not 1 <= n_trials <= 8:
        raise ValueError("P16: maximum of eight sequential trials")
    storage = None
    if sqlite is not None:
        db = safe_local_path(sqlite, ".db")
        if db.exists():
            raise FileExistsError("P16: existing studies cannot be overwritten or resumed implicitly")
        db.parent.mkdir(parents=True, exist_ok=True)
        storage = "sqlite:///" + db.as_posix()
    if optuna_module is None:
        try:
            import optuna as optuna_module
        except ImportError as exc:
            raise RuntimeError("Optuna is optional: install optuna==5.0.0 locally") from exc

    # Historical P2 synthetic source; the reserved P14 holdout is never read.
    groups = load_cases(DATA)
    pairs, unique_train, legacy_count = training_pairs(DATA, groups)
    validation = groups["validation"]
    results = []
    study = optuna_module.create_study(
        direction="minimize",
        sampler=optuna_module.samplers.TPESampler(seed=SEED),
        storage=storage,
        study_name=STUDY_NAME,
        load_if_exists=False,
    )

    def objective(trial):
        hidden = trial.suggest_categorical("hidden", [10, 14, 18])
        epochs = trial.suggest_int("epochs", 2, 8, step=2)
        rate = trial.suggest_categorical("rate", [0.12, 0.18, 0.24])
        model = create_network([18, hidden, 1], ["tanh", "sigmoid"], seed=SEED)
        train(model, pairs, epochs=epochs, learning_rate=rate, seed=SEED)
        score = evaluate(model, validation)
        risk = validation_risk(score)
        results.append({
            "trial": trial.number, "hidden": hidden, "epochs": epochs,
            "learningRate": rate,
            "validation": {k: score[k] for k in ("total", "tp", "tn", "fp", "fn")},
            "risk": risk,
        })
        return risk

    study.optimize(objective, n_trials=n_trials, n_jobs=1, show_progress_bar=False)
    if len(results) != n_trials:
        raise RuntimeError("P16: incomplete experiment")
    best = min(results, key=lambda item: (item["risk"], item["trial"]))
    return {
        "kind": "p2-local-optuna-experiment-v1",
        "selection": "train-validation-only",
        "trialBudget": n_trials,
        "trainingUniqueSamples": unique_train,
        "legacyTrainingAnchors": legacy_count,
        "bestTrial": best["trial"],
        "trials": results,
        "holdoutEvaluated": False,
        "p14HoldoutAccessed": False,
        "modelSaved": False,
        "promotionEligible": False,
    }


def main():
    parser = argparse.ArgumentParser(description="Optional P2 local Optuna experiment")
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument("--output", default="training/experiments/p2-optuna-summary.json")
    parser.add_argument("--sqlite", help="New local SQLite file; never a URL")
    args = parser.parse_args()
    output = safe_local_path(args.output, ".json")
    if output.exists():
        raise FileExistsError("P16: output already exists; choose a fresh file")
    result = optimize_local(n_trials=args.trials, sqlite=args.sqlite)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, allow_nan=False, indent=2)
        stream.write("\n")
    print(json.dumps({"kind": result["kind"], "trialBudget": result["trialBudget"],
                      "bestTrial": result["bestTrial"], "promotionEligible": False}))


if __name__ == "__main__":
    main()
