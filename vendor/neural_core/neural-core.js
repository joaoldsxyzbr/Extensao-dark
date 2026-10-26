/* Neural Core reutilizável - snapshot 5dc938747b64d6b5c5a7a8c442062006c51e1532; gerado localmente, sem rede. */
(function(root) {
'use strict';
/** Ativações suportadas por inferência; usar também no validador v1. */
const SUPPORTED_ACTIVATIONS = Object.freeze(['linear', 'relu', 'sigmoid', 'softmax', 'tanh']);

function activate(value, kind) {
  switch (kind) {
    case 'linear': return value;
    case 'relu': return Math.max(0, value);
    case 'tanh': return Math.tanh(value);
    case 'sigmoid': return value >= 0
      ? 1 / (1 + Math.exp(-value))
      : Math.exp(value) / (1 + Math.exp(value));
    default: throw new TypeError('Ativação não suportada');
  }
}

function forward(layers, input, workspace = null) {
  if (!(Array.isArray(input) || input instanceof Float32Array) || input.length !== layers[0].inputSize) {
    throw new TypeError('Entrada inválida: tamanho incompatível');
  }
  let values = workspace ? workspace.first : new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    if (typeof input[i] !== 'number' || !Number.isFinite(input[i])) {
      throw new TypeError(`Entrada ${i}: valor não finito`);
    }
    const item = Math.fround(input[i]);
    if (!Number.isFinite(item)) throw new RangeError(`Entrada ${i}: excede float32`);
    values[i] = item;
  }

  for (const layer of layers) {
    const outputs = workspace
      ? (values === workspace.first ? workspace.second : workspace.first)
      : new Float32Array(layer.outputSize);
    const logits = layer.activation === 'softmax'
      ? (workspace ? workspace.logits : new Float64Array(layer.outputSize))
      : null;
    for (let neuron = 0; neuron < layer.outputSize; neuron += 1) {
      let sum = layer.biases[neuron];
      const offset = neuron * layer.inputSize;
      for (let i = 0; i < layer.inputSize; i += 1) {
        sum += layer.weights[offset + i] * values[i];
      }
      if (!Number.isFinite(sum)) throw new RangeError('Resultado numérico não finito');
      if (logits) {
        logits[neuron] = sum;
      } else {
        const result = Math.fround(activate(sum, layer.activation));
        if (!Number.isFinite(result)) throw new RangeError('Resultado numérico não finito');
        outputs[neuron] = result;
      }
    }
    if (logits) {
      let maximum = -Infinity;
      for (let i = 0; i < logits.length; i += 1) maximum = Math.max(maximum, logits[i]);
      let total = 0;
      for (let i = 0; i < logits.length; i += 1) {
        logits[i] = Math.exp(logits[i] - maximum);
        total += logits[i];
      }
      for (let i = 0; i < logits.length; i += 1) outputs[i] = Math.fround(logits[i] / total);
    }
    values = outputs;
  }
  return workspace ? values.slice(0, layers[layers.length - 1].outputSize) : values;
}

/**
 * Execute many predictions, reusing two scratch buffers within this call.
 * Each returned Float32Array is independent; no state survives the batch.
 */
function forwardBatch(layers, inputs) {
  if (!Array.isArray(inputs)) throw new TypeError('Lote de entradas inválido');
  if (inputs.length > 4096) throw new RangeError('Lote acima do limite de tamanho');
  if (inputs.length === 0) return [];

  let maxWidth = layers[0].inputSize;
  for (const layer of layers) maxWidth = Math.max(maxWidth, layer.outputSize);
  const workspace = {
    first: new Float32Array(maxWidth),
    second: new Float32Array(maxWidth),
    logits: layers[layers.length - 1].activation === 'softmax'
      ? new Float64Array(layers[layers.length - 1].outputSize)
      : null
  };
  const results = [];
  for (const input of inputs) {
    results.push(forward(layers, input, workspace));
  }
  return results;
}


const FORMAT_VERSION = 1;
const MAX_MODEL_CHARS = 25_000_000;
const MAX_LAYERS = 16;
const MAX_NEURONS = 4096;
const MAX_PARAMETERS = 250_000;
const ACTIVATIONS = new Set(SUPPORTED_ACTIVATIONS);
const CAPABILITIES = Object.freeze({
  formatVersions: Object.freeze([FORMAT_VERSION]),
  operators: Object.freeze(['dense']),
  activations: SUPPORTED_ACTIVATIONS,
  limits: Object.freeze({
    maxLayers: MAX_LAYERS, maxWidth: MAX_NEURONS, maxParameters: MAX_PARAMETERS
  })
});
const internalLayers = new WeakMap();

function positiveSize(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_NEURONS) {
    throw new RangeError(`${label}: tamanho inválido ou acima do limite`);
  }
  return value;
}

function parameters(values, length, label) {
  if (!Array.isArray(values) || values.length !== length) {
    throw new TypeError(`${label}: tamanho inválido`);
  }
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    if (typeof values[i] !== 'number' || !Number.isFinite(values[i])) {
      throw new TypeError(`${label}[${i}]: valor não finito`);
    }
    const next = Math.fround(values[i]);
    if (!Number.isFinite(next)) {
      throw new RangeError(`${label}[${i}]: excede float32`);
    }
    data[i] = next;
  }
  return data;
}

function loadModel(source) {
  if (typeof source === 'string') {
    if (source.length > MAX_MODEL_CHARS) throw new RangeError('Modelo acima do limite de tamanho');
    source = JSON.parse(source);
  }
  if (!source || typeof source !== 'object' || Array.isArray(source) || source.formatVersion !== FORMAT_VERSION) {
    throw new TypeError('Modelo inválido ou versão desconhecida');
  }
  if (!Array.isArray(source.layers) || source.layers.length < 1 || source.layers.length > MAX_LAYERS) {
    throw new RangeError('Quantidade de camadas inválida');
  }
  let previousOutput = null;
  let totalParameters = 0;
  const layers = source.layers.map((layer, index) => {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
      throw new TypeError(`Camada ${index} inválida`);
    }
    if (Object.hasOwn(layer, 'operator') && layer.operator !== 'dense') {
      throw new TypeError(`Camada ${index}: operador desconhecido`);
    }
    const inputSize = positiveSize(layer.inputSize, `Camada ${index}: entrada`);
    const outputSize = positiveSize(layer.outputSize, `Camada ${index}: saída`);
    if (previousOutput !== null && previousOutput !== inputSize) {
      throw new RangeError(`Camada ${index}: dimensões desconectadas`);
    }
    if (!ACTIVATIONS.has(layer.activation)) {
      throw new TypeError(`Camada ${index}: ativação inválida`);
    }
    if (layer.activation === 'softmax' && (index !== source.layers.length - 1 || outputSize < 2)) {
      throw new RangeError('softmax exige camada de saída com pelo menos duas unidades');
    }
    const weightCount = inputSize * outputSize;
    totalParameters += weightCount + outputSize;
    if (totalParameters > MAX_PARAMETERS) throw new RangeError('Parâmetros acima do limite de tamanho');
    const weights = parameters(layer.weights, weightCount, `Camada ${index}: pesos`);
    const biases = parameters(layer.biases, outputSize, `Camada ${index}: vieses`);
    previousOutput = outputSize;
    return Object.freeze({ inputSize, outputSize, activation: layer.activation, weights, biases });
  });
  // O modelo expõe cópias defensivas: Float32Array não pode ser congelado.
  const model = Object.freeze({
    inputSize: layers[0].inputSize,
    outputSize: previousOutput,
    get layers() {
      return Object.freeze(layers.map(layer => Object.freeze({
        inputSize: layer.inputSize,
        outputSize: layer.outputSize,
        activation: layer.activation,
        weights: new Float32Array(layer.weights),
        biases: new Float32Array(layer.biases)
      })));
    }
  });
  internalLayers.set(model, layers);
  return model;
}

function assertLoadedModel(model) {
  if (!model || typeof model !== 'object' || !internalLayers.has(model)) {
    throw new TypeError('Carregue o modelo com loadModel antes de usar');
  }
}

function predict(model, input) {
  assertLoadedModel(model);
  return forward(internalLayers.get(model), input);
}

function predictBatch(model, inputs) {
  assertLoadedModel(model);
  return forwardBatch(internalLayers.get(model), inputs);
}

/**
 * Contrato de compatibilidade: apenas as capacidades realmente executáveis.
 * O resultado é somente leitura e não representa operadores futuros.
 */
function getCapabilities() {
  return CAPABILITIES;
}

/**
 * Retorna metadados de um modelo carregado, sem copiar as matrizes de pesos.
 * Útil para um consumidor decidir dimensões e custo antes de executar.
 */
function describeModel(model) {
  assertLoadedModel(model);
  const layers = internalLayers.get(model);
  let parameterCount = 0;
  const summary = layers.map(layer => {
    const count = layer.inputSize * layer.outputSize + layer.outputSize;
    parameterCount += count;
    return Object.freeze({
      inputSize: layer.inputSize,
      outputSize: layer.outputSize,
      activation: layer.activation,
      parameterCount: count
    });
  });
  return Object.freeze({
    formatVersion: FORMAT_VERSION,
    inputSize: layers[0].inputSize,
    outputSize: layers[layers.length - 1].outputSize,
    layerCount: layers.length,
    parameterCount,
    layers: Object.freeze(summary)
  });
}

function serializeModel(model) {
  assertLoadedModel(model);
  const layers = internalLayers.get(model);
  const raw = {
    formatVersion: FORMAT_VERSION,
    layers: layers.map(layer => ({
      inputSize: layer.inputSize,
      outputSize: layer.outputSize,
      activation: layer.activation,
      weights: Array.from(layer.weights),
      biases: Array.from(layer.biases)
    }))
  };
  return raw;
}
const api = Object.freeze({loadModel, predict, predictBatch, serializeModel, getCapabilities, describeModel});
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.NeuralCore = api;
})(globalThis);
