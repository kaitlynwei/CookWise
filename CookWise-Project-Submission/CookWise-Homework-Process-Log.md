# CookWise Homework Process Log

## Project

**Project name:** CookWise  
**Project type:** Beginner-friendly recipe and smart-eating website

## 1. Context Provided Before Requesting a Change

Before asking the AI to review the project, I explained the purpose and intended
experience of CookWise:

> This page is for beginner cooks who are trying to cook more at home rather
> than eating out. They should feel like there are many different, convenient
> recipes to choose from that are healthy and not too complicated to make. The
> website should motivate visitors to start cooking instead of only presenting
> a list of recipes. It should recommend a different meal each day, regularly
> change the order of recipes without deleting them, and reward users for trying
> new dishes or cooking the same dish multiple times. Visitors should feel
> motivated, not overwhelmed, and excited to get started.

After developing these features, I asked:

> Review my entire project and suggest one thing that is missing context-wise.

## 2. AI's Missing-Context Suggestion

The AI reviewed CookWise's home page, recipe search, recipe details, nutrition
guide, profile, account features, About section, and standalone homework file.

It identified **dietary fit and allergen information** as the most important
missing context. CookWise previously reminded users to check labels, but it did
not show possible allergens beside each recipe or allow users to save dietary
and allergen preferences.

The suggested addition included:

- Dietary labels such as vegetarian, vegan, gluten-free, and dairy-free
- Possible major allergens found in the ingredient list
- A reminder to verify packaged ingredient labels and the original source
- Profile preferences that prevent known conflicting recipes from being
  recommended

## 3. How I Addressed the Suggestion

I asked the AI to attach dietary and allergen information to recipes when
necessary and add a corresponding section to the profile page.

The project was updated to include:

1. A **Dietary and Allergen Information** section on recipe pages.
2. Automated screening for the FDA's nine major food allergens:
   - Milk
   - Egg
   - Fish
   - Crustacean shellfish
   - Tree nuts
   - Peanuts
   - Wheat
   - Soybeans
   - Sesame
3. Profile checkboxes that let users select allergens they want to avoid.
4. Profile options for vegetarian, vegan, gluten-free, and dairy-free
   preferences.
5. Automatic filtering that removes recipes when a selected allergen is
   detected in the imported ingredient wording.
6. Saved dietary and allergen preferences in the SQLite database.
7. Safety wording explaining that automatic screening cannot guarantee that a
   recipe is allergen-free or identify cross-contact.
8. A link to the FDA's major food allergen guidance.

## 4. Result

This change gives users important context before choosing a recipe and makes
CookWise more personal and responsible. It also supports the project's goal of
helping beginner cooks feel informed without overwhelming them.

After implementing the change, CookWise's automated test suite contained 30
passing tests and no failures.

## Source

[FDA: What is a major food allergen?](https://www.fda.gov/industry/fda-basics-industry/what-major-food-allergen)
