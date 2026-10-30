"""P16 regional two-head synthetic-only smoke, not release model."""
import json
import math
from pathlib import Path
from vendor.neural_core.training.network import create_network,predict
from vendor.neural_core.training.train import train
from vendor.neural_core.training.export import export_model
from training.train_neural_colors_p8 import atomic_json
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data/p16-demo-ci-data.json"
MODEL=ROOT/"data/p16-demo-ci-candidate.json"
REPORT=ROOT/"data/p16-demo-ci-report.json"
FAMILIES={"train":{"canvas","navigation","form","cards","table","nested"},
          "validation":{"notice","shell"}}
def load_dataset(filename=DATA):
    doc=json.loads(Path(filename).read_text(encoding="utf8"))
    if type(doc) is not dict or set(doc)!={"formatVersion","kind","origin","featureCount","samples"}:
        raise ValueError("P16: private or missing dataset fields")
    if (doc["formatVersion"]!=1 or doc["kind"]!="p16-synthetic-smoke-v1" or
        doc["origin"]!="authored-not-independent-human-labels" or
        doc["featureCount"]!=20 or type(doc["samples"]) is not list or len(doc["samples"])!=32):
        raise ValueError("P16: dataset contract invalid")
    rows={"train":[],"validation":[]}
    ids=set()
    seen_vectors=set()
    for item in doc["samples"]:
        if type(item) is not dict or set(item)!={"id","split","family","x","decision","palette"}:
            raise ValueError("P16: unexpected personal data or missing fields")
        family,split=item["family"],item["split"]
        if (split not in rows or family not in FAMILIES[split] or
            type(item["id"]) is not str or item["id"] not in
            {f"demo-{family}-{i}" for i in range(4)} or item["id"] in ids):
            raise ValueError("P16: family/split violation")
        ids.add(item["id"])
        x=item["x"]
        if (type(x) is not list or len(x)!=20 or
            any(type(v) not in (int,float) or not math.isfinite(v) or
                not 0<=v<=1 for v in x)):
            raise ValueError("P16: invalid feature vector")
        positive=item["id"].endswith("-1")
        if (type(item["decision"]) is not int or item["decision"]!=int(positive) or
            x[2]!=int(positive) or (positive and x[10]!=0) or
            item["palette"]!=([.06,.07,.08,.95,.96,.97] if positive else None)):
            raise ValueError("P16: invalid authored target")
        if tuple(x) in seen_vectors:
            raise ValueError("P16: duplicate synthetic features")
        seen_vectors.add(tuple(x))
        rows[split].append(item)
    for split,allowed in FAMILIES.items():
        if len(rows[split])!=4*len(allowed) or {r["family"] for r in rows[split]}!=allowed:
            raise ValueError("P16: incomplete or leaked split")
    return rows
def train_demo(epochs=8,filename=DATA):
    if type(epochs) is not int or not 1<=epochs<=20:
        raise ValueError("P16: epochs out of bounds")
    grouped=load_dataset(filename)
    training,validation=grouped["train"],grouped["validation"]
    decisions=[(r["x"],[r["decision"]]) for r in training]
    decisions += [(r["x"],[1]) for r in training if r["decision"]]*2
    palettes=[(r["x"],r["palette"]) for r in training if r["decision"]]
    a=create_network([20,12,1],["tanh","sigmoid"],seed=20261030)
    b=create_network([20,12,6],["tanh","sigmoid"],seed=20261031)
    train(a,decisions,epochs=epochs,batch_size=4,optimizer="adamw",
          loss="bce",learning_rate=.02,seed=20261030)
    train(b,palettes,epochs=epochs,batch_size=4,optimizer="adamw",
          loss="mse",learning_rate=.02,seed=20261031)
    a,b=export_model(a),export_model(b)
    candidate={"kind":"p16-region-ai-candidate-v1","formatVersion":1,
      "featuresVersion":1,"source":"synthetic-experimental-no-release",
      "heads":{"decision":a,"palette":b}}
    predictions=[{"id":r["id"],"decision":predict(a,r["x"])[0],
      "palette":predict(b,r["x"])} for r in validation]
    report={"kind":"p16-synthetic-parity-v1","trainRows":len(training),
      "validationRows":len(validation),"predictions":predictions,
      "humanLabels":False,"holdoutEvaluated":False,"p14HoldoutAccessed":False,
      "promotionEligible":False}
    return candidate,report
def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("--epochs",type=int,default=8)
    args=parser.parse_args()
    if MODEL.exists() or REPORT.exists():
        raise FileExistsError("P16: refuse to overwrite existing candidate")
    candidate,metrics=train_demo(args.epochs)
    atomic_json(candidate,MODEL)
    atomic_json(metrics,REPORT)
    print(json.dumps({"trainRows":metrics["trainRows"],
      "validationRows":metrics["validationRows"],"promotionEligible":False}))
if __name__=="__main__":
    main()
