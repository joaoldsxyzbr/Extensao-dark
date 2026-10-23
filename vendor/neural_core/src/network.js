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

export function forward(layers, input) {
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
