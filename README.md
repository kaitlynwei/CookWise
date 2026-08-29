# CookWise
CookWise is a beginner-friendly cooking website with clear recipes from many cuisines, ranging from simple meals to detailed dishes. When a recipe is opened, CookWise retrieves its current macros, difficulty, adjustable servings, provider ratings, nutrition context, and credited original source from Spoonacular.

The home page provides one daily cooking recommendation, while recipe search
uses a weekly rotation to keep the collection feeling fresh without deleting
recipes. Signed-in users can log every dish they cook, build a cooking history,
and stack Taste Trailblazer and Encore Expert achievements.

Profiles also store cooking preferences for serving count, cuisine, maximum
cook time, and minimum protein per serving. Signed-in recipe results and daily
recommendations prioritize close preference matches while retaining CookWise's
quality ranking.

Profile height and weight are entered in feet, inches, and pounds, then stored
internally in consistent units for calculations. Sign-up requires password
confirmation, password fields include visibility controls, and signed-in users
can permanently delete their account after confirming their current password.

CookWise's profile protein comparison follows the current 2025–2030 Dietary
Guidelines general target of 1.2–1.6 grams per kilogram of body weight per day.
The Macro Guide also includes the official 2,000-calorie daily servings pattern
and clearly labels it as a general reference rather than a personal prescription.

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

Catalog results are added using only the Spoonacular recipe ID, title, and image
URL. Full recipe information is never stored or cached.

CookWise rotates through a broad set of cuisines, meal types, breakfasts,
snacks, and desserts while keeping the number of Spoonacular searches per sync
reasonable. It also remembers the next result position for every topic, so a
later sync continues beyond recipes it already reviewed instead of repeatedly
starting at the top.

5. Start CookWise:

```sh
npm start
```

Then open `http://127.0.0.1:8080`.

For development, you can use `npm run dev` instead. The development server
automatically restarts when project files change.

## Project structure

```text
CookWise/
├── public/              Public stylesheets and browser-side scripts
├── src/                 Node.js application server
│   └── views/           HTML pages served through clean routes
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

The permanent recipe catalog stores only the Spoonacular recipe ID, title, and
image URL. Ingredients, instructions, nutrition, servings, cuisine, scores,
source information, and other Spoonacular fields are requested only when a user
opens a recipe. They are returned to that user and discarded immediately without
being written to SQLite or held in a server cache. The recipe page displays the
original source name and hyperlink returned by Spoonacular.

The web service checks periodically whether the last successful catalog refresh
was at least 24 hours ago. That timestamp and a short-lived refresh lease are
stored in SQLite, so Railway redeployments do not cause duplicate API calls and
overlapping refreshes are prevented. A failed refresh does not replace the last
successful timestamp.

On Railway, mount the persistent volume at `/app/data`; CookWise will use
`/app/data/cookwise.db`. Keep `SPOONACULAR_API_KEY` in Railway's server-side
environment variables. Never expose it in browser-side code.
