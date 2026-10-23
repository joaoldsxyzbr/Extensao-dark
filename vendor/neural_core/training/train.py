"""SGD reproduzível em dados locais, sem chamadas externas."""

import math
import random

from .network import _finite_float, _vector, loss_and_gradients, predict
from .export import export_model


def _samples(network, dataset):
    if not isinstance(dataset, (list, tuple)) or not dataset:
        raise ValueError("Dataset deve conter amostras")
    input_size = network["layers"][0]["inputSize"]
    output_size = network["layers"][-1]["outputSize"]
    samples = []
    for sample in dataset:
        if not isinstance(sample, (list, tuple)) or len(sample) != 2:
            raise ValueError("Amostra deve ser par (entrada, alvo)")
        x = list(_vector(sample[0], input_size, "Entrada"))
        y = list(_vector(sample[1], output_size, "Alvo"))
        samples.append((x, y))
    return samples


def _mean_loss(network, samples):
    """Evaluate predictions without the backward pass."""
    total = 0.0
    for inputs, targets in samples:
        residuals = [actual - target for actual, target in zip(predict(network, inputs), targets)]
        total += 0.5 * sum(value * value for value in residuals)
    result = total / len(samples)
    if not math.isfinite(result):
        raise ValueError("Perda média não finita")
    return result


def dataset_loss(network, dataset):
    """Média da perda 1/2 * soma dos erros quadráticos por exemplo."""
    return _mean_loss(network, _samples(network, dataset))


def train(network, dataset, *, epochs=1000, learning_rate=0.1, seed=0):
    """Reproducible SGD. Commit updates only when every epoch succeeds.

    A failed training run leaves the caller's network (and parameter lists) unchanged.
    Successful runs continue to update the original parameter lists in place.
    """
    if type(epochs) is not int or not 1 <= epochs <= 1_000_000:
        raise ValueError("epochs deve ser inteiro entre 1 e 1000000")
    learning_rate = _finite_float(learning_rate, "learning_rate")
    if learning_rate <= 0:
        raise ValueError("learning_rate deve ser finito e positivo")
    if type(seed) is not int:
        raise ValueError("seed deve ser um inteiro")
    export_model(network)  # Validate the versioned architecture and parameters before training.
    samples = _samples(network, dataset)  # Validate the entire dataset before updating anything.

    # Isolate all intermediate SGD updates so a numerical divergence is recoverable.
    candidate = {"formatVersion": 1, "layers": [
        {**layer, "weights": layer["weights"][:], "biases": layer["biases"][:]}
        for layer in network["layers"]
    ]}
    initial_loss = _mean_loss(candidate, samples)
    rng = random.Random(seed)
    order = list(range(len(samples)))
    for _ in range(epochs):
        rng.shuffle(order)
        for index in order:
            inputs, targets = samples[index]
            _, gradients = loss_and_gradients(candidate, inputs, targets)
            for layer, gradient in zip(candidate["layers"], gradients):
                for field in ("weights", "biases"):
                    for j in range(len(layer[field])):
                        next_value = layer[field][j] - learning_rate * gradient[field][j]
                        if not math.isfinite(next_value):
                            raise ValueError("Treinamento divergiu; ajuste a taxa de aprendizado")
                        layer[field][j] = next_value
    final_loss = _mean_loss(candidate, samples)
    for original, trained in zip(network["layers"], candidate["layers"]):
        original["weights"][:] = trained["weights"]
        original["biases"][:] = trained["biases"]
    return {"initialLoss": initial_loss, "finalLoss": final_loss, "epochs": epochs}
