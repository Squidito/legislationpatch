# LegislationPatch

U.S. federal legislation explained in plain English — patch notes style.

---

## Files in this folder

| File | What it does |
|------|-------------|
| `index.html` | The main page |
| `styles.css` | All styling |
| `app.js` | UI logic and rendering |
| `api.js` | Congress.gov + Anthropic API calls |
| `config.js` | **Your API keys go here** |

---

## Step 1 — Get your API keys

### Congress.gov API key (free)
1. Go to https://api.congress.gov/sign-up/
2. Fill out the short form with your name and email
3. You'll receive a key by email within a few minutes
4. Copy the key

### Anthropic API key
1. Go to https://console.anthropic.com/
2. Sign in or create an account
3. Click "API Keys" in the left sidebar
4. Click "Create Key", give it a name, copy the key
5. Note: you need a small amount of API credits. New accounts get some free credits.

---

## Step 2 — Add your keys to config.js

Open `config.js` in any text editor (Notepad works fine) and paste your keys:

```js
const CONFIG = {
  CONGRESS_API_KEY:  "paste-your-congress-key-here",
  ANTHROPIC_API_KEY: "paste-your-anthropic-key-here",
  BILLS_PER_PAGE: 20,
  CONGRESS_SESSION: 119,
};
```

Save the file.

---

## Step 3 — Test it locally

Just double-click `index.html` to open it in your browser.

> **Note:** The Congress.gov API may not work when opening the file directly due to browser security rules (CORS). If bills don't load, follow Step 4 to deploy to Netlify — it will work perfectly there.

---

## Step 4 — Deploy to Netlify (free, takes 2 minutes)

1. Go to https://netlify.com and create a free account
2. Once logged in, find the section that says **"Deploy manually"** or drag-and-drop
3. Drag your entire `legislationpatch` folder onto the Netlify dashboard
4. Netlify gives you a live URL instantly (e.g. `https://your-site.netlify.app`)
5. Share that link with anyone!

To update the site later, just drag the folder again.

---

## How the app works

1. On load, it calls the Congress.gov API to fetch the 20 most recently updated bills
2. For each bill, it detects the current stage (Committee, Senate floor, etc.) by reading the action history
3. It estimates passage likelihood based on stage and co-sponsor count
4. When you click "Analyze with AI", it sends the bill summary to Claude (Anthropic API) which generates:
   - Patch notes broken into categories (Budget, Healthcare, Defense, etc.)
   - Who opposes the bill and why
   - What the bill does NOT address
   - Updated passage likelihood reasoning

---

## Keeping your API keys safe

- Do NOT upload `config.js` to a public GitHub repository — your keys would be exposed
- If you want to use GitHub, add `config.js` to a `.gitignore` file
- For a more secure production setup, move API calls to a backend server so keys aren't in the browser

---

## Troubleshooting

**Bills aren't loading**
- Check that your Congress.gov API key is correct in `config.js`
- Open browser DevTools (F12) → Console tab to see any error messages
- Try deploying to Netlify instead of opening the file locally

**AI analysis fails**
- Check that your Anthropic API key is correct
- Make sure you have API credits at console.anthropic.com
- The error message in the app will tell you what went wrong

**"Not found" errors**
- The Congress.gov API sometimes rate-limits requests — wait 60 seconds and refresh

---

## Customization

- Change `BILLS_PER_PAGE` in `config.js` to show more or fewer bills
- Change `CONGRESS_SESSION` to a different session number (e.g. `118` for the previous Congress)
- Edit colors in `styles.css` under the `:root` section at the top
