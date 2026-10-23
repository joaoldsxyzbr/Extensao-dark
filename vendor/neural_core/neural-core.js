/* Neural Core reutilizável - snapshot fa8bf190613e414eb41ea47a2bffa139950f2d81; gerado localmente, sem rede. */
(function(root) {
'use strict';
function activate(value, kind) {
  switch (kind) {
    case 'linear': return value;
    case 'tanh': return Math.tanh(value);
    case 'sigmoid': return value >= 0
      ? 1 / (1 + Math.exp(-value))
      : Math.exp(value) / (1 + Math.exp(value));
    default: throw new TypeError('Ativação não suportada');
  }
}

function forward(layers, input) {
  if (!(Array.isArray(input) || input instanceof Float32Array) || input.length !== layers[0].inputSize) {
    throw new TypeError('Entrada inválida: tamanho incompatível');
  }
  let values = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    if (typeof input[i] !== 'number' || !Number.isFinite(input[i])) {
      throw new TypeError(`Entrada ${i}: valor não finito`);
    }
    const item = Math.fround(input[i]);
    if (!Number.isFinite(item)) throw new RangeError(`Entrada ${i}: excede float32`);
    values[i] = item;
  }

  for (const layer of layers) {
    const outputs = new Float32Array(layer.outputSize);
    for (let neuron = 0; neuron < layer.outputSize; neuron += 1) {
      let sum = layer.biases[neuron];
      const offset = neuron * layer.inputSize;
      for (let i = 0; i < layer.inputSize; i += 1) {
        sum += layer.weights[offset + i] * values[i];
      }
      const result = Math.fround(activate(sum, layer.activation));
      if (!Number.isFinite(result)) throw new RangeError('Resultado numérico não finito');
      outputs[neuron] = result;
    }
    values = outputs;
  }
  return values;
}


const FORMAT_VERSION = 1;
const MAX_MODEL_CHARS = 25_000_000;
const MAX_LAYERS = 16;
const MAX_NEURONS = 4096;
const MAX_PARAMETERS = 250_000;
const ACTIVATIONS = new Set(['linear', 'sigmoid', 'tanh']);
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
    const inputSize = positiveSize(layer.inputSize, `Camada ${index}: entrada`);
    const outputSize = positiveSize(layer.outputSize, `Camada ${index}: saída`);
    if (previousOutput !== null && previousOutput !== inputSize) {
      throw new RangeError(`Camada ${index}: dimensões desconectadas`);
    }
    if (!ACTIVATIONS.has(layer.activation)) {
      throw new TypeError(`Camada ${index}: ativação inválida`);
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
const api = Object.freeze({loadModel, predict, serializeModel});
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.NeuralCore = api;
})(globalThis);
