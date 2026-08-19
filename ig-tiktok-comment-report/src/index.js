const MAX_COMMENTS = 300;
const MAX_COMMENT_CHARS = 300;
const MAX_PROMPT_CHARS = 20000;

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("instagram.com")) return "instagram";
    if (host.endsWith("tiktok.com")) return "tiktok";
    return null;
  } catch {
    return null;
  }
}

// Recursively substitutes {{URL}} inside a parsed JSON template with the real post URL.
function fillTemplate(node, url) {
  if (typeof node === "string") return node.replaceAll("{{URL}}", url);
  if (Array.isArray(node)) return node.map((n) => fillTemplate(n, url));
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = fillTemplate(v, url);
    return out;
  }
  return node;
}

async function runApifyActor(actorId, inputTemplate, url, apifyToken) {
  const safeActorId = actorId.replaceAll("/", "~");
  const input = fillTemplate(JSON.parse(inputTemplate), url);
  const endpoint = `https://api.apify.com/v2/acts/${safeActorId}/run-sync-get-dataset-items?token=${apifyToken}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify actor ${actorId} returned ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Apify actors don't agree on a field name for the comment text, so try the common ones.
function extractCommentText(item) {
  const candidates = ["text", "comment", "commentText", "content", "message", "caption"];
  for (const key of candidates) {
    const val = item?.[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}

function buildCommentBlock(comments) {
  let block = "";
  let count = 0;
  for (const raw of comments.slice(0, MAX_COMMENTS)) {
    const text = raw.slice(0, MAX_COMMENT_CHARS);
    const line = `${count + 1}. ${text}\n`;
    if (block.length + line.length > MAX_PROMPT_CHARS) break;
    block += line;
    count += 1;
  }
  return { block, count };
}

async function analyzeComments(comments, url, platform, apiKey) {
  const { block, count } = buildCommentBlock(comments);

  const system = `You analyze social media comment threads. You will be given a numbered list of comments from a ${platform} post. Produce a concise plain-text report with these exact sections, each on its own line as a heading followed by content:

KEY TOPICS
(3-6 bullet points, the main things commenters are talking about)

OVERALL CONSENSUS
(1-3 sentences describing what most commenters agree on, if anything)

POINTS OF DISAGREEMENT
(bullet points on where commenters diverge or argue; write "None notable" if the thread is uniform)

SENTIMENT
(rough breakdown, e.g. "Positive 60% / Neutral 25% / Negative 15%", plus one sentence of context)

NOTABLE QUOTES
(2-4 short verbatim quotes that best represent the discussion, each on its own line)

Use plain text only, no markdown symbols like # or **. Keep the whole report under 350 words.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      system,
      messages: [
        {
          role: "user",
          content: `Post URL: ${url}\nNumber of comments analyzed: ${count}\n\nComments:\n${block}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.content?.map((c) => c.text).join("") ?? "";
  return { text, analyzedCount: count };
}

function textResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return textResponse("Error: send a POST request with a JSON body like {\"url\": \"...\"}");
    }

    const providedSecret = request.headers.get("x-api-key");
    if (!env.SHARED_SECRET || providedSecret !== env.SHARED_SECRET) {
      return new Response("Error: unauthorized", { status: 401 });
    }

    let url;
    try {
      ({ url } = await request.json());
    } catch {
      return textResponse("Error: request body must be JSON with a \"url\" field");
    }
    if (!url) return textResponse("Error: missing \"url\" field");

    const platform = detectPlatform(url);
    if (!platform) {
      return textResponse("Error: URL must be an instagram.com or tiktok.com link");
    }

    const actorId = platform === "instagram" ? env.APIFY_INSTAGRAM_ACTOR : env.APIFY_TIKTOK_ACTOR;
    const inputTemplate = platform === "instagram" ? env.APIFY_INSTAGRAM_INPUT : env.APIFY_TIKTOK_INPUT;
    if (!actorId || !inputTemplate) {
      return textResponse(`Error: worker is missing Apify config for ${platform}. Set APIFY_${platform.toUpperCase()}_ACTOR and APIFY_${platform.toUpperCase()}_INPUT.`);
    }

    let items;
    try {
      items = await runApifyActor(actorId, inputTemplate, url, env.APIFY_TOKEN);
    } catch (e) {
      return textResponse(`Error scraping comments: ${e.message}`);
    }

    const comments = (items || []).map(extractCommentText).filter(Boolean);
    if (!comments.length) {
      return textResponse(`No comments found on this ${platform} post (or the scraper's field names don't match extractCommentText in src/index.js — check the actor's dataset schema).`);
    }

    let analysis;
    try {
      analysis = await analyzeComments(comments, url, platform, env.ANTHROPIC_API_KEY);
    } catch (e) {
      return textResponse(`Error analyzing comments: ${e.message}`);
    }

    const header = `${platform.toUpperCase()} COMMENT REPORT\n${url}\n${comments.length} comments scraped, ${analysis.analyzedCount} analyzed\n\n`;
    return textResponse(header + analysis.text);
  },
};
