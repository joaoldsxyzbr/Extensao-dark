/** Ativações suportadas por inferência; usar também no validador v1. */
export const SUPPORTED_ACTIVATIONS = Object.freeze(['linear', 'relu', 'sigmoid', 'softmax', 'tanh']);

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

export function forward(layers, input, workspace = null) {
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
export function forwardBatch(layers, inputs) {
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
