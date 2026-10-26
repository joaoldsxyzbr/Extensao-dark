"""Exportação JSON v1 para o motor de inferência JavaScript."""

import json
import math
import os
from pathlib import Path
import struct
import tempfile

from .network import _ACTIVATIONS


_MAX_LAYERS = 16
_MAX_WIDTH = 4096
_MAX_PARAMETERS = 250_000


def _as_float32(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Todos os parâmetros precisam ser números finitos")
    try:
        converted = float(value)
        if not math.isfinite(converted):
            raise ValueError("Todos os parâmetros precisam ser números finitos")
        rounded = struct.unpack("<f", struct.pack("<f", converted))[0]
    except (OverflowError, struct.error) as exc:
        raise ValueError("Valor excede float32") from exc
    if not math.isfinite(rounded):
        raise ValueError("Valor excede float32")
    return rounded


def export_model(model):
    """Valida e retorna um modelo JSON-friendly, convertido a float32."""
    if not isinstance(model, dict) or type(model.get("formatVersion")) is not int or model["formatVersion"] != 1:
        raise ValueError("Versão do modelo inválida")
    layers = model.get("layers")
    if not isinstance(layers, list) or not 1 <= len(layers) <= _MAX_LAYERS:
        raise ValueError("Quantidade de camadas inválida")
    output = []
    parameters = 0
    previous = None
    for layer in layers:
        if not isinstance(layer, dict):
            raise ValueError("Camada inválida")
        if "operator" in layer and layer["operator"] != "dense":
            raise ValueError("Operador desconhecido na camada")
        input_size, output_size = layer.get("inputSize"), layer.get("outputSize")
        if any(type(n) is not int or not 1 <= n <= _MAX_WIDTH for n in (input_size, output_size)):
            raise ValueError("Dimensões inválidas")
        if previous is not None and input_size != previous:
            raise ValueError("Dimensões entre camadas incompatíveis")
        if type(layer.get("activation")) is not str or layer["activation"] not in _ACTIVATIONS:
            raise ValueError("Ativação inválida")
        if layer["activation"] == "softmax" and (len(output) != len(layers) - 1 or output_size < 2):
            raise ValueError("softmax exige camada de saída com pelo menos duas unidades")
        weight_count = input_size * output_size
        parameters += weight_count + output_size
        if parameters > _MAX_PARAMETERS:
            raise ValueError("Excedeu limite de parâmetros")
        weights, biases = layer.get("weights"), layer.get("biases")
        if not isinstance(weights, list) or len(weights) != weight_count:
            raise ValueError("Pesos inválidos")
        if not isinstance(biases, list) or len(biases) != output_size:
            raise ValueError("Vieses inválidos")
        output.append({"inputSize": input_size, "outputSize": output_size,
                       "activation": layer["activation"],
                       "weights": [_as_float32(v) for v in weights],
                       "biases": [_as_float32(v) for v in biases]})
        previous = output_size
    return {"formatVersion": 1, "layers": output}


def save_model(model, filename):
    """Substitui arquivo de modelo com seguranca usando rename no mesmo diretorio."""
    encoded = json.dumps(export_model(model), ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    destination = Path(filename)
    temporary_path = None
    try:
        # O temporario permanece no mesmo filesystem para os.replace ser atomico.
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=destination.parent,
            prefix=f".{destination.name}.", suffix=".tmp", delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(encoded + "\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, destination)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def get_capabilities():
    """Contrato comum Python/JS para execução de camadas densas v1.

    Retorna estruturas independentes, para o chamador não alterar o contrato.
    """
    return {
        "formatVersions": [1],
        "operators": ["dense"],
        "activations": sorted(_ACTIVATIONS),
        "limits": {
            "maxLayers": _MAX_LAYERS,
            "maxWidth": _MAX_WIDTH,
            "maxParameters": _MAX_PARAMETERS,
        },
    }


def describe_model(model):
    """Descreve modelo exportável sem expor parâmetros ao consumidor."""
    portable = export_model(model)
    summaries = []
    total = 0
    for layer in portable["layers"]:
        count = layer["inputSize"] * layer["outputSize"] + layer["outputSize"]
        total += count
        summaries.append({
            "inputSize": layer["inputSize"],
            "outputSize": layer["outputSize"],
            "activation": layer["activation"],
            "parameterCount": count,
        })
    return {
        "formatVersion": 1,
        "inputSize": portable["layers"][0]["inputSize"],
        "outputSize": portable["layers"][-1]["outputSize"],
        "layerCount": len(portable["layers"]),
        "parameterCount": total,
        "layers": summaries,
    }
