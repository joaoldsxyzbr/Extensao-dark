"""MLP densa de referência para treinamento offline, somente biblioteca padrão."""

import math
import random

_ACTIVATIONS = {"linear", "tanh", "sigmoid"}
_MAX_WIDTH = 4096
_MAX_LAYERS = 16
_MAX_PARAMETERS = 250_000


def _size(value):
    if type(value) is not int or not 1 <= value <= _MAX_WIDTH:
        raise ValueError("Cada dimensão deve ser um inteiro positivo limitado a 4096")
    return value


def _finite_float(value, label):
    """Validate native numeric inputs before converting huge integers to float."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label}: número finito obrigatório")
    try:
        converted = float(value)
    except (OverflowError, TypeError, ValueError) as exc:
        raise ValueError(f"{label}: número fora do intervalo suportado") from exc
    if not math.isfinite(converted):
        raise ValueError(f"{label}: número finito obrigatório")
    return converted


def _vector(values, size, label):
    if not isinstance(values, (list, tuple)) or len(values) != size:
        raise ValueError(f"{label}: dimensão incorreta")
    return [_finite_float(value, label) for value in values]


def create_network(sizes, activations, *, seed=0):
    """Inicializa MLP com pesos Xavier e ordem [neurônio_saida][entrada]."""
    if not isinstance(sizes, (list, tuple)) or not 2 <= len(sizes) <= _MAX_LAYERS + 1:
        raise ValueError("É necessário entre uma e dezesseis camadas densas")
    if not isinstance(activations, (list, tuple)) or len(activations) != len(sizes) - 1:
        raise ValueError("Informe exatamente uma ativação por camada")
    if type(seed) is not int:
        raise ValueError("A seed deve ser um inteiro")
    widths = [_size(size) for size in sizes]
    if sum((a + 1) * b for a, b in zip(widths, widths[1:])) > _MAX_PARAMETERS:
        raise ValueError("Modelo excede 250000 parâmetros")
    if any(activation not in _ACTIVATIONS for activation in activations):
        raise ValueError("Ativação desconhecida")
    rng = random.Random(seed)
    layers = []
    for input_size, output_size, activation in zip(widths, widths[1:], activations):
        limit = math.sqrt(6 / (input_size + output_size))
        layers.append({
            "inputSize": input_size,
            "outputSize": output_size,
            "activation": activation,
            "weights": [rng.uniform(-limit, limit) for _ in range(input_size * output_size)],
            "biases": [0.0] * output_size,
        })
    return {"formatVersion": 1, "layers": layers}


def _activate(value, kind):
    if kind == "tanh":
        return math.tanh(value)
    if kind == "sigmoid":
        return 1 / (1 + math.exp(-value)) if value >= 0 else math.exp(value) / (1 + math.exp(value))
    return value


def _derivative(output, kind):
    if kind == "tanh":
        return 1 - output * output
    if kind == "sigmoid":
        return output * (1 - output)
    return 1.0


def _forward(model, inputs):
    layers = model["layers"]
    current = list(_vector(inputs, layers[0]["inputSize"], "Entrada"))
    cache = [current]
    for layer in layers:
        next_values = []
        width = layer["inputSize"]
        for neuron in range(layer["outputSize"]):
            offset = neuron * width
            total = layer["biases"][neuron]
            for input_idx in range(width):
                total += layer["weights"][offset + input_idx] * current[input_idx]
            result = _activate(total, layer["activation"])
            if not math.isfinite(result):
                raise ValueError("Inferência produziu valor não finito")
            next_values.append(result)
        cache.append(next_values)
        current = next_values
    return cache


def predict(model, inputs):
    """Previsão offline em Python. O runtime dos consumidores continua em JS."""
    return _forward(model, inputs)[-1][:]


def loss_and_gradients(model, inputs, target):
    """Perda 1/2 * soma((predição-alvo)^2) e gradientes por camada."""
    cache = _forward(model, inputs)
    layers = model["layers"]
    y = _vector(target, layers[-1]["outputSize"], "Alvo")
    output = cache[-1]
    residual = [a - b for a, b in zip(output, y)]
    loss = 0.5 * sum(value * value for value in residual)
    if not math.isfinite(loss):
        raise ValueError("Perda não finita")
    gradients = [None] * len(layers)
    delta = [r * _derivative(a, layers[-1]["activation"]) for r, a in zip(residual, output)]
    for index in range(len(layers) - 1, -1, -1):
        layer = layers[index]
        previous = cache[index]
        gradients[index] = {
            "weights": [delta[neuron] * previous[i]
                        for neuron in range(layer["outputSize"])
                        for i in range(layer["inputSize"])],
            "biases": delta[:],
        }
        if index:
            prior = layers[index - 1]
            prev_output = cache[index]
            next_delta = []
            for i in range(layer["inputSize"]):
                influence = sum(
                    layer["weights"][neuron * layer["inputSize"] + i] * delta[neuron]
                    for neuron in range(layer["outputSize"])
                )
                next_delta.append(influence * _derivative(prev_output[i], prior["activation"]))
            delta = next_delta
    return loss, gradients
