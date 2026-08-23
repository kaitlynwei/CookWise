function cleanPunctuation(value) {
  return String(value || "")
    .replace(/\bMediterrean\b/g, "Mediterranean")
    .replace(/\bmediterrean\b/g, "mediterranean")
    .replace(/\bPean\b/g, "Pea")
    .replace(/\bpean\b/g, "pea")
    .replace(/\bradis\b/gi, "radish")
    .replace(/\bpesa\b/gi, "peas")
    .replace(/\bsoft(?=\d)/gi, "$& ")
    .replace(/\bAdd the bacon a cook\b/gi, "Add the bacon and cook")
    .replace(/\bsyrup consistently\b/gi, "syrup consistency")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])(?=[A-Z][a-z])/g, "$1 ")
    .replace(/,([A-Za-z])/g, ", $1")
    .replace(/([;:])(?=[A-Za-z])/g, "$1 ")
    .replace(/\.{2}(?!\.)/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanIngredientName(value) {
  return cleanPunctuation(value)
    .replace(/\s+(?:torn|chopped|diced|sliced)\s+or$/i, "")
    .trim();
}

module.exports = { cleanIngredientName, cleanPunctuation };
