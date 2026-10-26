import { forward, forwardBatch, SUPPORTED_ACTIVATIONS } from './network.js';

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

export function loadModel(source) {
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

export function assertLoadedModel(model) {
  if (!model || typeof model !== 'object' || !internalLayers.has(model)) {
    throw new TypeError('Carregue o modelo com loadModel antes de usar');
  }
}

export function predict(model, input) {
  assertLoadedModel(model);
  return forward(internalLayers.get(model), input);
}

export function predictBatch(model, inputs) {
  assertLoadedModel(model);
  return forwardBatch(internalLayers.get(model), inputs);
}

/**
 * Contrato de compatibilidade: apenas as capacidades realmente executáveis.
 * O resultado é somente leitura e não representa operadores futuros.
 */
export function getCapabilities() {
  return CAPABILITIES;
}

/**
 * Retorna metadados de um modelo carregado, sem copiar as matrizes de pesos.
 * Útil para um consumidor decidir dimensões e custo antes de executar.
 */
export function describeModel(model) {
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

export function serializeModel(model) {
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
