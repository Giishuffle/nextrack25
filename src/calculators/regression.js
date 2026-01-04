/**
 * Linear Regression Utilities
 * Used for calculating metrics from the daily_outcomes_curve
 */

/**
 * Simple linear regression implementation
 * Calculates y = mx + b for given x and y arrays
 *
 * @param {number[]} x - Independent variable values
 * @param {number[]} y - Dependent variable values
 * @returns {Object} - { slope, intercept, rSquared }
 */
export function linearRegression(x, y) {
  if (x.length !== y.length) {
    throw new Error('Arrays must have equal length');
  }

  if (x.length < 2) {
    throw new Error('Need at least 2 data points for regression');
  }

  const n = x.length;

  // Calculate means
  const meanX = x.reduce((sum, val) => sum + val, 0) / n;
  const meanY = y.reduce((sum, val) => sum + val, 0) / n;

  // Calculate slope (m) and intercept (b)
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
    denominator += (x[i] - meanX) ** 2;
  }

  // Handle edge case where all x values are the same
  if (denominator === 0) {
    return {
      slope: 0,
      intercept: meanY,
      rSquared: 0
    };
  }

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  // Calculate R-squared (coefficient of determination)
  let ssRes = 0; // Residual sum of squares
  let ssTot = 0; // Total sum of squares

  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i] + intercept;
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }

  const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;

  return {
    slope,
    intercept,
    rSquared
  };
}

/**
 * Predict y value for a given x using regression coefficients
 * @param {number} x - Input value
 * @param {number} slope - Regression slope
 * @param {number} intercept - Regression intercept
 * @returns {number} - Predicted y value
 */
export function predict(x, slope, intercept) {
  return slope * x + intercept;
}

/**
 * Calculate the derivative (rate of change) between two points
 * @param {number} x1 - First x value
 * @param {number} y1 - First y value
 * @param {number} x2 - Second x value
 * @param {number} y2 - Second y value
 * @returns {number} - Rate of change (dy/dx)
 */
export function derivative(x1, y1, x2, y2) {
  const dx = x2 - x1;
  if (dx === 0) return 0;
  return (y2 - y1) / dx;
}

/**
 * Calculate weighted average
 * @param {number[]} values - Values to average
 * @param {number[]} weights - Weights for each value
 * @returns {number} - Weighted average
 */
export function weightedAverage(values, weights) {
  if (values.length !== weights.length) {
    throw new Error('Values and weights must have equal length');
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = values.reduce((sum, val, i) => sum + val * weights[i], 0);
  return weightedSum / totalWeight;
}
