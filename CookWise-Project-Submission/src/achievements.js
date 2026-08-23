function achievementSummary(uniqueRecipes, repeatFavorites) {
  return [
    {
      name: "Taste Trailblazer",
      count: Number(uniqueRecipes),
      description: "Earn one every time you cook a recipe you have never logged before."
    },
    {
      name: "Encore Expert",
      count: Number(repeatFavorites),
      description: "Earn one for each recipe you cook at least four times."
    }
  ];
}

module.exports = { achievementSummary };
