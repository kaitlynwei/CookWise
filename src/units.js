const CENTIMETERS_PER_INCH = 2.54;
const POUNDS_PER_KILOGRAM = 2.2046226218;

function centimetersToFeetAndInches(centimeters) {
  if (centimeters === null || centimeters === "" || !Number.isFinite(Number(centimeters))) {
    return { feet: null, inches: null };
  }
  const totalInches = Math.round(Number(centimeters) / CENTIMETERS_PER_INCH);
  return {
    feet: Math.floor(totalInches / 12),
    inches: totalInches % 12
  };
}

function feetAndInchesToCentimeters(feet, inches) {
  return (Number(feet) * 12 + Number(inches)) * CENTIMETERS_PER_INCH;
}

function kilogramsToPounds(kilograms) {
  if (
    kilograms === null ||
    kilograms === "" ||
    !Number.isFinite(Number(kilograms))
  ) return null;
  return Math.round(Number(kilograms) * POUNDS_PER_KILOGRAM * 10) / 10;
}

function poundsToKilograms(pounds) {
  return Number(pounds) / POUNDS_PER_KILOGRAM;
}

module.exports = {
  centimetersToFeetAndInches,
  feetAndInchesToCentimeters,
  kilogramsToPounds,
  poundsToKilograms
};
