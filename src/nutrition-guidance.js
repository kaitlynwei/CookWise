function proteinTargetRange(weightKilograms) {
  const weight = Number(weightKilograms);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  return {
    min: Math.round(weight * 1.2),
    max: Math.round(weight * 1.6)
  };
}

module.exports = { proteinTargetRange };
