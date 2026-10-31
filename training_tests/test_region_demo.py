"""P16 authored training and privacy gates."""
import json
import tempfile
import unittest
from pathlib import Path
from training.train_region_demo import load_dataset,train_demo,SELECTED_EPOCHS
class P16Tests(unittest.TestCase):
    def test_split_and_train(self):
        grouped=load_dataset()
        self.assertEqual([len(grouped[s]) for s in ("train","validation")],[24,8])
        self.assertFalse({r["family"] for r in grouped["train"]} &
                         {r["family"] for r in grouped["validation"]})
        candidate,report=train_demo(epochs=2)
        self.assertEqual(candidate["heads"]["decision"]["layers"][0]["inputSize"],20)
        self.assertEqual(candidate["heads"]["palette"]["layers"][-1]["outputSize"],6)
        self.assertFalse(report["promotionEligible"])
        self.assertFalse(report["holdoutEvaluated"])
        with self.assertRaisesRegex(ValueError,"epochs"):
            train_demo(epochs=0)
    def test_selected_epochs_dominate_previous_default_on_validation(self):
        grouped=load_dataset()
        val=grouped["validation"]
        def evaluate(epochs):
            candidate,report=train_demo(epochs=epochs)
            hits=sum(1 for p in report["predictions"]
                     if (p["decision"]>=.5)==bool(
                         next(r for r in val if r["id"]==p["id"])["decision"]))
            square=sum((a-b)**2 for p in report["predictions"]
                       for r in val if r["id"]==p["id"] and r["decision"]==1
                       for a,b in zip(p["palette"],r["palette"]))
            margin=sum(abs(p["decision"]-r["decision"])
                       for p in report["predictions"]
                       for r in val if r["id"]==p["id"])
            return hits,square,margin
        self.assertEqual(SELECTED_EPOCHS,9)
        hits_new,square_new,margin_new=evaluate(SELECTED_EPOCHS)
        hits_old,square_old,margin_old=evaluate(8)
        self.assertEqual(hits_new,8)
        self.assertEqual(hits_old,8)
        self.assertLess(square_new,square_old)
        self.assertLess(margin_new,margin_old)
    def test_rejects_private_and_leaked_records(self):
        grouped=load_dataset()
        doc={"formatVersion":1,"kind":"p16-synthetic-smoke-v1",
             "origin":"authored-not-independent-human-labels",
             "featureCount":20,"samples":[*grouped["train"],*grouped["validation"]]}
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"bad.json"
            x=json.loads(json.dumps(doc))
            x["samples"][0]["url"]="private"
            path.write_text(json.dumps(x))
            with self.assertRaisesRegex(ValueError,"personal"):
                load_dataset(path)
            x=json.loads(json.dumps(doc))
            x["samples"][0]["split"]="validation"
            path.write_text(json.dumps(x))
            with self.assertRaisesRegex(ValueError,"split"):
                load_dataset(path)
