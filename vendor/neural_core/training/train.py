"""Treinamento MLP reproduzível em Python padrão, com atualização transacional."""

import math
import random

from .network import (
    _finite_float, _vector, loss_and_gradients, sample_loss, validate_loss, validate_target,
)
from .export import export_model


def _samples(network, dataset, loss):
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
        validate_target(y, loss)
        samples.append((x, y))
    return samples


def _mean_loss(network, samples, loss="mse"):
    """Evaluate predictions without the backward pass."""
    total = 0.0
    for inputs, targets in samples:
        total += sample_loss(network, inputs, targets, loss=loss)
    result = total / len(samples)
    if not math.isfinite(result):
        raise ValueError("Perda média não finita")
    return result


def dataset_loss(network, dataset, *, loss="mse"):
    """Média da perda selecionada por exemplo, sem gradientes."""
    validate_loss(network, loss)
    return _mean_loss(network, _samples(network, dataset, loss), loss)


def _state(network):
    return [{
        field: [0.0] * len(layer[field])
        for field in ("weights", "biases")
    } for layer in network["layers"]]


def train(network, dataset, *, epochs=1000, learning_rate=0.1, seed=0,
          batch_size=1, optimizer="sgd", momentum=0.9,
          beta1=0.9, beta2=0.999, epsilon=1e-8, weight_decay=0.01, loss="mse",
          validation_dataset=None, patience=None, min_delta=0.0, record_history=False):
    """SGD, momentum ou AdamW. Pesos originais só mudam depois do sucesso completo.

    Defaults preservam o SGD por amostra da v0.1.0. Estados dos otimizadores
    ficam apenas nesta chamada; cada invocação inicia um treinamento novo.
    """
    if type(epochs) is not int or not 1 <= epochs <= 1_000_000:
        raise ValueError("epochs deve ser inteiro entre 1 e 1000000")
    if type(batch_size) is not int or not 1 <= batch_size <= 100_000:
        raise ValueError("batch_size deve ser inteiro positivo até 100000")
    if type(record_history) is not bool:
        raise ValueError("record_history deve ser booleano")
    if patience is not None and (type(patience) is not int or patience < 1):
        raise ValueError("patience deve ser inteiro positivo")
    min_delta = _finite_float(min_delta, "min_delta")
    if min_delta < 0:
        raise ValueError("min_delta não pode ser negativo")
    if validation_dataset is None and (patience is not None or min_delta != 0):
        raise ValueError("patience/min_delta exigem conjunto de validação")
    if optimizer not in ("sgd", "momentum", "adamw"):
        raise ValueError("Otimizador inválido")
    if type(seed) is not int:
        raise ValueError("seed deve ser um inteiro")
    learning_rate = _finite_float(learning_rate, "learning_rate")
    momentum = _finite_float(momentum, "momentum")
    beta1 = _finite_float(beta1, "beta1")
    beta2 = _finite_float(beta2, "beta2")
    epsilon = _finite_float(epsilon, "epsilon")
    weight_decay = _finite_float(weight_decay, "weight_decay")
    if learning_rate <= 0 or epsilon <= 0 or weight_decay < 0:
        raise ValueError("learning_rate/epsilon devem ser positivos e weight_decay não negativo")
    if not 0 <= momentum < 1 or not 0 <= beta1 < 1 or not 0 <= beta2 < 1:
        raise ValueError("momentum e betas devem estar no intervalo [0, 1)")
    export_model(network)
    validate_loss(network, loss)
    samples = _samples(network, dataset, loss)
    validation = _samples(network, validation_dataset, loss) if validation_dataset is not None else None
    if validation is not None:
        training_features = {tuple(x) for x, _ in samples}
        if any(tuple(x) in training_features for x, _ in validation):
            raise ValueError("Conjuntos de treino e validação compartilham entradas")

    candidate = {"formatVersion": 1, "layers": [
        {**layer, "weights": layer["weights"][:], "biases": layer["biases"][:]}
        for layer in network["layers"]
    ]}
    initial_loss = _mean_loss(candidate, samples, loss)
    initial_val = _mean_loss(candidate, validation, loss) if validation is not None else None
    best_val = initial_val
    best_epoch = 0
    best_parameters = [
        (layer["weights"][:], layer["biases"][:]) for layer in candidate["layers"]
    ] if validation is not None else None
    history = [{"epoch": 0, "trainLoss": initial_loss,
                **({"validationLoss": initial_val} if validation is not None else {})}] if record_history else None
    stale_epochs = 0
    epochs_run = 0
    rng = random.Random(seed)
    order = list(range(len(samples)))
    first_moment = _state(candidate) if optimizer != "sgd" else None
    second_moment = _state(candidate) if optimizer == "adamw" else None
    step = 0

    for epoch in range(1, epochs + 1):
        rng.shuffle(order)
        for start in range(0, len(order), batch_size):
            indices = order[start:start + batch_size]
            mean_gradients = _state(candidate)
            for index in indices:
                x, y = samples[index]
                _, gradients = loss_and_gradients(candidate, x, y, loss=loss)
                for accumulated, gradient in zip(mean_gradients, gradients):
                    for field in ("weights", "biases"):
                        for j, value in enumerate(gradient[field]):
                            accumulated[field][j] += value
            step += 1
            for layer_index, (layer, gradients) in enumerate(zip(candidate["layers"], mean_gradients)):
                for field in ("weights", "biases"):
                    params = layer[field]
                    for j in range(len(params)):
                        gradient = gradients[field][j] / len(indices)
                        if not math.isfinite(gradient):
                            raise ValueError("Gradiente não finito")
                        if optimizer == "sgd":
                            update = gradient
                            next_value = params[j] - learning_rate * update
                        elif optimizer == "momentum":
                            velocity = first_moment[layer_index][field]
                            velocity[j] = momentum * velocity[j] + gradient
                            next_value = params[j] - learning_rate * velocity[j]
                        else:
                            m = first_moment[layer_index][field]
                            v = second_moment[layer_index][field]
                            m[j] = beta1 * m[j] + (1.0 - beta1) * gradient
                            v[j] = beta2 * v[j] + (1.0 - beta2) * gradient * gradient
                            if not math.isfinite(m[j]) or not math.isfinite(v[j]):
                                raise ValueError("Estado do otimizador não finito")
                            corrected_m = m[j] / (1.0 - beta1 ** step)
                            corrected_v = v[j] / (1.0 - beta2 ** step)
                            update = corrected_m / (math.sqrt(corrected_v) + epsilon)
                            # AdamW regulariza pesos, nunca vieses.
                            decay = learning_rate * weight_decay * params[j] if field == "weights" else 0.0
                            next_value = params[j] - decay - learning_rate * update
                        if not math.isfinite(next_value):
                            raise ValueError("Treinamento divergiu; ajuste a taxa de aprendizado")
                        params[j] = next_value

        epochs_run = epoch
        # Validacao determina somente a selecao do checkpoint, nunca gradientes.
        epoch_validation = _mean_loss(candidate, validation, loss) if validation is not None else None
        if validation is not None:
            if epoch_validation < best_val - min_delta:
                best_val = epoch_validation
                best_epoch = epoch
                best_parameters = [
                    (layer["weights"][:], layer["biases"][:]) for layer in candidate["layers"]
                ]
                stale_epochs = 0
            else:
                stale_epochs += 1
        if record_history:
            history.append({"epoch": epoch,
                            "trainLoss": _mean_loss(candidate, samples, loss),
                            **({"validationLoss": epoch_validation} if validation is not None else {})})
        if validation is not None and patience is not None and stale_epochs >= patience:
            break

    if validation is not None:
        for layer, (weights, biases) in zip(candidate["layers"], best_parameters):
            layer["weights"][:] = weights
            layer["biases"][:] = biases
    final_loss = _mean_loss(candidate, samples, loss)
    # Valor finito em float64 pode não caber em float32 (contrato JS).
    export_model(candidate)
    for original, trained in zip(network["layers"], candidate["layers"]):
        original["weights"][:] = trained["weights"]
        original["biases"][:] = trained["biases"]
    result = {"initialLoss": initial_loss, "finalLoss": final_loss, "epochs": epochs}
    if validation is not None:
        result.update({"initialValidationLoss": initial_val,
                       "bestValidationLoss": best_val,
                       "bestEpoch": best_epoch,
                       "epochsRun": epochs_run,
                       "stoppedEarly": epochs_run < epochs})
    if record_history:
        result["history"] = history
    return result
