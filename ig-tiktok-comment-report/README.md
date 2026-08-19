# IG/TikTok Comment Report

Share an Instagram or TikTok post from the iOS share sheet and get back a plain-text
report on the comments: key topics, overall consensus, points of disagreement,
sentiment, and a few notable quotes.

**How it works:** iOS Shortcut → Cloudflare Worker → Apify (scrapes comments) →
Claude (analyzes them) → report text shown right in the Shortcut.

**Cost at personal-use volume:** Cloudflare Workers free tier (100k req/day) and
Apify's free plan ($5/month platform credit, enough for light/occasional use with a
pay-per-usage actor) cover this for free. The only real recurring cost is Claude API
usage, roughly a cent or two per report.

**Before you start:** scraping comments off Instagram/TikTok is against both
platforms' Terms of Service. This is intended for your own personal, low-volume use
(reading public post comments you could read by hand anyway) — not for redistribution
or commercial use. Scrapers can also break without notice when the platforms change
their site, since this isn't an official API.

---

## 1. Apify account + actors (comment scraping)

1. Create a free account at https://apify.com.
2. You need one actor for Instagram comments and one for TikTok comments. Browse the
   Apify Store and pick one for each platform — a few reasonable starting points as of
   this writing:
   - Instagram: [supreme_coder/instagram-comments-scraper](https://apify.com/supreme_coder/instagram-comments-scraper),
     [automation-lab/instagram-comments-scraper](https://apify.com/automation-lab/instagram-comments-scraper)
   - TikTok: [clockworks/tiktok-comments-scraper](https://apify.com/clockworks/tiktok-comments-scraper),
     [automation-lab/tiktok-comments-scraper](https://apify.com/automation-lab/tiktok-comments-scraper)

   Apify actors change hands and pricing models often, so **check the actor's
   "Pricing" tab before picking one**: an actor priced "pay per usage" draws from
   your $5/month free platform credit; an actor priced as a paid "rental" charges you
   directly regardless of the free credit and is not free.

3. On your chosen actor's page, open the **API** tab → **run sync and get dataset
   items**. It shows the actor ID (looks like `owner~actor-name` in the endpoint URL)
   and an example input JSON. Copy that actor ID and that JSON.

4. In the copied JSON, find whichever field holds the post URL (commonly
   `directUrls`, `postURLs`, or `startUrls`) and replace its value with the literal
   string `{{URL}}` — the Worker substitutes the real post URL into that spot at
   request time. Keep any other fields (like a comment limit) as given, or lower them
   to control cost, e.g.:
   ```json
   { "directUrls": ["{{URL}}"], "resultsLimit": 150 }
   ```

5. Get your Apify API token: Console → Settings → Integrations → Personal API tokens.

## 2. Anthropic API key (comment analysis)

1. Create a key at https://console.anthropic.com → API Keys. There's no permanent
   free tier, but usage for this is cheap (a few cents at most per report with Claude
   Sonnet).

## 3. Deploy the Cloudflare Worker

From this folder:

```bash
cd ig-tiktok-comment-report
npm install
npx wrangler login          # opens a browser to link/create your free Cloudflare account

npx wrangler secret put SHARED_SECRET          # make up any password — the Shortcut sends this
npx wrangler secret put APIFY_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APIFY_INSTAGRAM_ACTOR   # e.g. supreme_coder~instagram-comments-scraper
npx wrangler secret put APIFY_TIKTOK_ACTOR      # e.g. clockworks~tiktok-comments-scraper
npx wrangler secret put APIFY_INSTAGRAM_INPUT   # the JSON template from step 1.4, as one line
npx wrangler secret put APIFY_TIKTOK_INPUT      # same, for the TikTok actor

npm run deploy
```

The deploy output prints your Worker URL, something like:
`https://ig-tiktok-comment-report.<your-subdomain>.workers.dev`

Test it:

```bash
curl -X POST https://ig-tiktok-comment-report.<your-subdomain>.workers.dev \
  -H "x-api-key: <your SHARED_SECRET>" \
  -H "content-type: application/json" \
  -d '{"url": "https://www.instagram.com/p/SOME_POST_ID/"}'
```

You should get back a plain-text report. If comment extraction comes back empty, open
`src/index.js`, find `extractCommentText`, and add whatever field name your chosen
actor actually uses for comment text (check the actor's dataset/output schema on its
Apify page).

## 4. Build the iOS Shortcut

In the Shortcuts app, create a new shortcut:

1. **Settings (top-right ⓘ):** turn on "Show in Share Sheet." Under "Share Sheet
   Types," accept **URLs** and **Text** (Instagram/TikTok's share menu usually hands
   over a URL, but Text as a fallback doesn't hurt).
2. Add action **Get Contents of URL**:
   - URL: your Worker URL from step 3
   - Method: `POST`
   - Headers: add `x-api-key` → your `SHARED_SECRET`
   - Request Body: **JSON**, add a field `url` and set its value to **Shortcut Input**
     (tap the field, pick the magic-variable "Shortcut Input")
3. Add action **Show Result**, input: the result of "Get Contents of URL." (Quick
   Look also works if you want a scrollable full-screen view instead.)
4. Name the shortcut (e.g. "Comment Report") and save.

To use it: open the post in Instagram/TikTok → Share → scroll the share sheet →
tap **Comment Report**. After a few seconds (scraping + analysis) it shows the
report.
