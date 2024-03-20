function getRandomBinary() {
  return Math.random() < 0.5 ? 1 : 0;
}

function calculateAverage(numIterations) {
  let sum = 0;
  for (let i = 0; i < numIterations; i++) {
    sum += getRandomBinary();
  }
  return sum / numIterations;
}

const numIterations = 100000000;
const average = calculateAverage(numIterations);

console.log(`Average after ${numIterations} iterations: ${average}`);
