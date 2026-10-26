"""MLP densa de referência para treinamento offline, somente biblioteca padrão."""

import math
import random

_ACTIVATIONS = {"linear", "tanh", "sigmoid", "relu", "softmax"}
_LOSSES = {"mse", "bce", "cce"}
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
    """Inicializa MLP: He uniforme para ReLU e Xavier para demais ativações."""
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
    if "softmax" in activations[:-1] or (activations[-1] == "softmax" and widths[-1] < 2):
        raise ValueError("softmax exige camada de saída com pelo menos duas unidades")
    rng = random.Random(seed)
    layers = []
    for input_size, output_size, activation in zip(widths, widths[1:], activations):
        limit = math.sqrt(6 / input_size) if activation == "relu" else math.sqrt(6 / (input_size + output_size))
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
    if kind == "relu":
        return max(0.0, value)
    return value


def _derivative(output, kind):
    if kind == "tanh":
        return 1 - output * output
    if kind == "sigmoid":
        return output * (1 - output)
    if kind == "relu":
        return 1.0 if output > 0 else 0.0
    if kind == "linear":
        return 1.0
    raise ValueError("Derivada de ativação não suportada")


def validate_loss(model, loss):
    if type(loss) is not str or loss not in _LOSSES:
        raise ValueError("Função de perda inválida")
    final = model["layers"][-1]
    activation = final["activation"]
    if (loss == "bce" and (activation != "sigmoid" or final["outputSize"] != 1)) or (
        loss == "cce" and (activation != "softmax" or final["outputSize"] < 2)
    ) or (loss == "mse" and activation == "softmax"):
        raise ValueError("Função de perda incompatível com a saída da rede")


def validate_target(target, loss):
    if loss == "bce" and any(not 0 <= y <= 1 for y in target):
        raise ValueError("BCE exige alvo entre 0 e 1")
    if loss == "cce":
        if (any(not 0 <= y <= 1 for y in target) or
                not math.isclose(sum(target), 1.0, rel_tol=1e-9, abs_tol=1e-9)):
            raise ValueError("CCE exige distribuição de probabilidade válida")


def _forward(model, inputs, *, with_logits=False):
    layers = model["layers"]
    current = list(_vector(inputs, layers[0]["inputSize"], "Entrada"))
    cache = [current]
    last_logits = None
    for layer in layers:
        logits = []
        width = layer["inputSize"]
        for neuron in range(layer["outputSize"]):
            offset = neuron * width
            total = layer["biases"][neuron]
            for input_idx in range(width):
                total += layer["weights"][offset + input_idx] * current[input_idx]
            if not math.isfinite(total):
                raise ValueError("Inferência produziu valor não finito")
            logits.append(total)
        if layer["activation"] == "softmax":
            maximum = max(logits)
            exponentials = [math.exp(value - maximum) for value in logits]
            scale = sum(exponentials)
            next_values = [value / scale for value in exponentials]
        else:
            next_values = [_activate(value, layer["activation"]) for value in logits]
        if not all(math.isfinite(value) for value in next_values):
            raise ValueError("Inferência produziu valor não finito")
        cache.append(next_values)
        current = next_values
        last_logits = logits
    return (cache, last_logits) if with_logits else cache


def predict(model, inputs):
    """Previsão offline em Python. O runtime dos consumidores continua em JS."""
    return _forward(model, inputs)[-1][:]


def _loss_and_delta(output, logits, target, activation, loss):
    if loss == "mse":
        residual = [a - b for a, b in zip(output, target)]
        return (0.5 * sum(r * r for r in residual),
                [r * _derivative(a, activation) for r, a in zip(residual, output)])
    if loss == "bce":
        z, y = logits[0], target[0]
        # Softplus estável em logits extremos; dL/dz = sigmoid(z) - y.
        return math.log1p(math.exp(-abs(z))) + max(z, 0.0) - y * z, [output[0] - y]
    maximum = max(logits)
    centered = [z - maximum for z in logits]
    log_normalizer = math.log(sum(math.exp(z) for z in centered))
    return (log_normalizer - sum(y * z for y, z in zip(target, centered)),
            [a - y for a, y in zip(output, target)])


def sample_loss(model, inputs, target, *, loss="mse"):
    """Calcula perda sem executar retropropagação."""
    validate_loss(model, loss)
    y = _vector(target, model["layers"][-1]["outputSize"], "Alvo")
    validate_target(y, loss)
    cache, logits = _forward(model, inputs, with_logits=True)
    value, _ = _loss_and_delta(cache[-1], logits, y, model["layers"][-1]["activation"], loss)
    if not math.isfinite(value):
        raise ValueError("Perda não finita")
    return value


def loss_and_gradients(model, inputs, target, *, loss="mse"):
    """Gradientes analíticos para MSE, BCE+sigmoid e CCE+softmax."""
    validate_loss(model, loss)
    layers = model["layers"]
    y = _vector(target, layers[-1]["outputSize"], "Alvo")
    validate_target(y, loss)
    cache, logits = _forward(model, inputs, with_logits=True)
    value, delta = _loss_and_delta(cache[-1], logits, y, layers[-1]["activation"], loss)
    if not math.isfinite(value) or not all(math.isfinite(v) for v in delta):
        raise ValueError("Perda ou gradiente não finito")
    gradients = [None] * len(layers)
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
    return value, gradients
