"""Security and no-holdout gates for the optional P2 optimizer."""
import tempfile
import unittest
from unittest.mock import patch
from training import optimize_contextual_local as exp


class Trial:
    def __init__(self, number):
        self.number = number

    def suggest_categorical(self, name, values):
        return values[self.number % len(values)]

    def suggest_int(self, name, start, end, step):
        return start + step * self.number


class FakeStudy:
    def optimize(self, callback, *, n_trials, n_jobs, show_progress_bar):
        assert n_jobs == 1 and not show_progress_bar
        for number in range(n_trials):
            assert callback(Trial(number)) >= 0


class FakeOptuna:
    class samplers:
        @staticmethod
        def TPESampler(seed):
            assert seed == exp.SEED
            return object()

    @staticmethod
    def create_study(**params):
        assert params["storage"] is None
        assert params["direction"] == "minimize"
        assert params["load_if_exists"] is False
        return FakeStudy()


class NoHoldout(dict):
    def __getitem__(self, name):
        if name == "holdout":
            raise AssertionError("optimizer touched holdout")
        return super().__getitem__(name)


class OptunaOfflineTests(unittest.TestCase):
    def test_path_restrictions(self):
        for value in ("data/neural-model.json", "../escape.json",
                      "training/experiments/../unsafe.json",
                      "https://example.com/test.json",
                      "training/experiments/dataset.db",
                      "training/experiments/.hidden.json"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                exp.safe_local_path(value, ".json")
        self.assertEqual(exp.safe_local_path(
            "training/experiments/report-1.json", ".json").parent,
            exp.EXPERIMENTS.resolve())

    def test_risk_prefers_few_false_positives_but_rejects_all_preserve(self):
        self.assertEqual(exp.validation_risk({
            "tp": 6, "tn": 4, "fp": 0, "fn": 0, "total": 10}), 0)
        self.assertEqual(exp.validation_risk({
            "tp": 3, "tn": 4, "fp": 2, "fn": 1, "total": 10}), 41)
        self.assertGreaterEqual(exp.validation_risk({
            "tp": 0, "tn": 4, "fp": 0, "fn": 6, "total": 10}), 1000)
        for value in (
            {"tp": True, "tn": 3, "fp": 0, "fn": 1, "total": 4},
            {"tp": 1, "tn": 3, "fp": 0, "fn": 1, "total": 100},
        ):
            with self.assertRaises(ValueError):
                exp.validation_risk(value)

    def test_only_train_validation_and_no_weight_export(self):
        train_pairs = [([0.1] * 18, [0])]
        validation = [{"x": [0.2] * 18, "y": [1]}]
        group = NoHoldout(train=[object()], validation=validation)
        visited = []

        def fake_model(dimensions, activation, seed):
            visited.append(dimensions[1])
            return object()

        def fake_train(model, pairs, **kwargs):
            self.assertIs(pairs, train_pairs)

        def fake_evaluate(model, rows):
            self.assertIs(rows, validation)
            return {"total": 10, "tp": 6, "tn": 4, "fp": 0, "fn": 0}

        with (patch.object(exp, "load_cases", return_value=group),
              patch.object(exp, "training_pairs", return_value=(train_pairs, 1, 0)),
              patch.object(exp, "create_network", side_effect=fake_model),
              patch.object(exp, "train", side_effect=fake_train),
              patch.object(exp, "evaluate", side_effect=fake_evaluate)):
            report = exp.optimize_local(n_trials=2, optuna_module=FakeOptuna)
        self.assertEqual(visited, [10, 14])
        self.assertEqual(report["bestTrial"], 0)
        self.assertFalse(report["holdoutEvaluated"])
        self.assertFalse(report["p14HoldoutAccessed"])
        self.assertFalse(report["modelSaved"])
        self.assertFalse(report["promotionEligible"])
        self.assertNotIn("x", report["trials"][0])

    def test_bounds_and_database_not_overwritten(self):
        for count in (0, -1, 9, True, 2.5):
            with self.assertRaises(ValueError):
                exp.optimize_local(n_trials=count, optuna_module=FakeOptuna)
        exp.EXPERIMENTS.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=exp.EXPERIMENTS, suffix=".db") as tmp:
            with self.assertRaises(FileExistsError):
                exp.optimize_local(n_trials=1, sqlite=tmp.name, optuna_module=FakeOptuna)


if __name__ == "__main__":
    unittest.main()
