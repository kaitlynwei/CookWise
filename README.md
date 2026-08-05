# CookWise
CookWise is a beginner-friendly cooking website with clear recipes from many cuisines, ranging from simple meals to detailed dishes. Each recipe includes macros, difficulty, adjustable servings, provider ratings, nutrition context, and a link to its credited source.

## Run CookWise

CookWise requires Node.js 22.5 or newer because it uses the built-in SQLite
module.

1. Get a free Spoonacular API key from
   [spoonacular.com/food-api](https://spoonacular.com/food-api).
2. Copy `.env.example` to a new file named `.env`.
3. Replace `replace_with_your_key` in `.env` with your API key.
4. Import the real recipe catalog:

```sh
npm run recipes:sync
```

Each sync reviews up to 50 candidates by default. To choose any batch size from
25 through 100, add the `--candidates` option. For example:

```sh
npm run recipes:sync -- --candidates=100
```

Candidates that pass CookWise's safeguards are added to the catalog. Because
many candidates may be rejected or already stored, the number added will
usually be lower than the number reviewed.

5. Start CookWise:

```sh
npm start
```

Then open `http://127.0.0.1:3000`.

For development, you can use `npm run dev` instead. The development server
automatically restarts when project files change.

## Project structure

```text
CookWise/
├── public/              Browser-facing HTML pages
│   └── js/              Browser-side functionality
├── src/                 Node.js application server
├── scripts/             Recipe database import tools
├── tests/               Automated tests
├── data/                Local SQLite database files
├── .env.example         Environment variable template
├── package.json         Commands and project information
└── README.md            Setup and usage documentation
```

Keep private API keys in `.env`. That file and the local database are excluded
from Git.

Account passwords are stored as salted hashes. Profile and session data are
stored locally in `data/cookwise.db`, which is excluded from Git.

Recipe records are imported from Spoonacular into the same SQLite database.
CookWise requires a valid source, usable ingredients and instructions, nutrition
data, a cook time of 90 minutes or less, and no more than 20 listed ingredients.
Recipes with less-than-ideal but non-extreme macros are kept with practical
nutrition guidance instead of being discarded. Every recipe retains a link to
its credited source, and each sync varies its search position to discover a
different group of candidates.

Each successful sync accumulates new approved recipes and updates recipes that
were imported previously. Existing recipes are retained unless they no longer
pass the current source, rating, instruction, cook-time, ingredient-count, or
nutrition safeguards.
