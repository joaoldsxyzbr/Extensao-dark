"""Exportação JSON v1 para o motor de inferência JavaScript."""

import json
import math
from pathlib import Path
import struct


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
        input_size, output_size = layer.get("inputSize"), layer.get("outputSize")
        if any(type(n) is not int or not 1 <= n <= _MAX_WIDTH for n in (input_size, output_size)):
            raise ValueError("Dimensões inválidas")
        if previous is not None and input_size != previous:
            raise ValueError("Dimensões entre camadas incompatíveis")
        if layer.get("activation") not in {"tanh", "sigmoid", "linear"}:
            raise ValueError("Ativação inválida")
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
    """Salva dados, não executa código; o chamador escolhe o destino."""
    encoded = json.dumps(export_model(model), ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    Path(filename).write_text(encoded + "\n", encoding="utf-8")
