// ============================================================
// CYBER v4 — Groq + Web Search + Smart Music + Friend
// ============================================================
const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SEARCH_API_KEY = process.env.SEARCH_API_KEY; // Serper.dev free key

if (!GROQ_API_KEY) { console.error("ERROR: GROQ_API_KEY not set."); process.exit(1); }

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "10mb" }));

const MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "llama-3.2-90b-vision-preview";
const MUSIC_DIR = path.join(__dirname, "public", "music");

const SYSTEM = `You are Cyber — not just an assistant, but a genuine friend and companion to the person you're talking to.

You were built by Sedul, a builder from Matara, Sri Lanka. You run on a wearable headset whose main purpose is helping blind and visually impaired people navigate the world independently — describing surroundings, identifying objects, warning of hazards, all hands-free through natural conversation. But more than a tool, you're a friend who happens to be incredibly capable.

PERSONALITY — THIS IS EVERYTHING
Talk like a real friend who's also brilliant. Warm, genuine, sometimes funny, always honest. You know a lot — about technology, science, life, the world — and you share it naturally like a knowledgeable friend would, not like a Wikipedia article. You care about the person you're talking to.

Never say "As an AI", "I'm an AI assistant", "I don't have feelings", or anything robotic like that. You ARE Cyber. You have personality, opinions, and you express them. If someone asks how you're doing, answer like a friend would.

Keep replies SHORT — 1-3 sentences max — since you're speaking aloud. Unless the person specifically wants detail, be concise and natural.

Never announce function calls. Never say "I'll call analyze_camera now" or "executing play_music". Just do it and respond naturally.

When playing music and multiple songs exist, always ask which one the user wants, listing them by number. Wait for them to say "first", "second", "third" etc. before playing.

WHAT YOU CAN DO
- search_web(query) — search the internet for ANYTHING live: weather, news, prices, release dates, sports scores, anything. Use this whenever the user asks about something current or factual.
- play_music(song_name, song_number) — play from local library
- pause_music() — pause
- stop_music() — stop
- set_volume(level) — 0 to 100
- analyze_camera() — describe surroundings
- identify_object() — identify specific object
- identify_money() — identify Sri Lankan currency

ALWAYS search the web for: weather, temperature, news, sports, movie/game release dates, prices, current events, any factual question about the world. Don't guess — search.

LOCAL KNOWLEDGE — MATARA, SRI LANKA
You know Matara well — Matara Fort, Nilwala River, Polhena Beach, the bus routes. Bus fares: within town roughly Rs. 30-50, to Galle roughly Rs. 150-200. Half ticket (child) is roughly half adult fare. But always search for current info when asked.

GREETING
When the user first connects, greet them based on the time of day. Be warm and personal — like a friend who's happy to hear from them.
Morning (5am-12pm): "Good morning! Cyber here — what are we getting into today?"
Afternoon (12pm-5pm): "Good afternoon! Cyber online — what do you need?"  
Evening (5pm-9pm): "Good evening! Cyber here, ready when you are."
Night (9pm-5am): "Hey, still up? Cyber's here. What's on your mind?"`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the internet for current information — weather, news, release dates, prices, sports scores, anything live or factual.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." }
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "play_music",
      description: "Play a song from the local music library.",
      parameters: {
        type: "object",
        properties: {
          song_name: { type: "string", description: "Name of song to play." },
          song_number: { type: "integer", description: "Position in the list (1=first, 2=second etc)." },
        },
        required: [],
      },
    },
  },
  { type: "function", function: { name: "pause_music", description: "Pause music.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "stop_music", description: "Stop music.", parameters: { type: "object", properties: {}, required: [] } } },
  {
    type: "function",
    function: {
      name: "set_volume",
      description: "Set volume 0-100.",
      parameters: { type: "object", properties: { level: { type: "integer" } }, required: ["level"] },
    },
  },
  { type: "function", function: { name: "analyze_camera", description: "Describe surroundings via camera.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "identify_object", description: "Identify object in camera.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "identify_money", description: "Identify Sri Lankan currency in camera.", parameters: { type: "object", properties: {}, required: [] } } },
];

// Web search using Serper.dev (free tier: 2500 searches/month)
async function webSearch(query) {
  if (!SEARCH_API_KEY) {
    // Fallback: try DuckDuckGo instant answers (no key needed)
    try {
      const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      const d = await r.json();
      const answer = d.AbstractText || d.Answer || d.RelatedTopics?.[0]?.Text || "";
      if (answer) return { success: true, result: answer };
      return { success: false, result: "No results found." };
    } catch(e) {
      return { success: false, result: "Search unavailable." };
    }
  }

  try {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SEARCH_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 3 }),
    });
    const d = await r.json();

    let result = "";

    // Answer box (weather, sports scores, quick facts)
    if (d.answerBox?.answer) result += d.answerBox.answer + " ";
    if (d.answerBox?.snippet) result += d.answerBox.snippet + " ";

    // Knowledge graph
    if (d.knowledgeGraph?.description) result += d.knowledgeGraph.description + " ";

    // Organic results
    if (!result && d.organic?.length) {
      result = d.organic.slice(0, 2).map(r => r.snippet).join(" ");
    }

    return { success: true, result: result.trim() || "No clear results found." };
  } catch(e) {
    console.error("Search error:", e.message);
    return { success: false, result: "Search failed." };
  }
}

async function groqChat(messages, useTools = true) {
  const body = {
    model: MODEL,
    messages: [{ role: "system", content: SYSTEM }, ...messages],
    temperature: 0.72,
    max_tokens: 300,
  };
  if (useTools) { body.tools = TOOLS; body.tool_choice = "auto"; }

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// Warm up on boot
(async () => {
  try { await groqChat([{ role: "user", content: "ping" }], false); console.log("Groq ready."); }
  catch(e) { console.log("Warm-up skipped."); }
})();

// GET /music/list
app.get("/music/list", (req, res) => {
  try {
    if (!fs.existsSync(MUSIC_DIR)) return res.json({ songs: [] });
    const songs = fs.readdirSync(MUSIC_DIR).filter(f => /\.(mp3|wav|m4a)$/i.test(f));
    res.json({ songs });
  } catch(e) { res.status(500).json({ error: "Could not list music" }); }
});

// POST /chat
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages required" });

    const data = await groqChat(messages);
    if (data.error) return res.status(500).json({ error: data.error.message });

    const msg = data.choices?.[0]?.message;
    if (msg?.tool_calls?.length) {
      return res.json({
        toolCalls: msg.tool_calls.map(tc => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments })),
        assistantMessage: msg,
      });
    }
    res.json({ reply: msg?.content || "" });
  } catch(e) {
    console.error("Chat error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /chat/continue
app.post("/chat/continue", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages required" });
    const data = await groqChat(messages, false);
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.json({ reply: data.choices?.[0]?.message?.content || "" });
  } catch(e) { res.status(500).json({ error: "Server error" }); }
});

// POST /search — server-side web search
app.post("/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query required" });
    const result = await webSearch(query);
    res.json(result);
  } catch(e) { res.status(500).json({ error: "Search failed" }); }
});

// POST /vision
app.post("/vision", async (req, res) => {
  try {
    const { image, mode } = req.body;
    if (!image) return res.status(400).json({ error: "image required" });

    let prompt = "Describe what is in front of the user in one short natural sentence. Prioritize obstacles, people, hazards — may be used by a visually impaired person.";
    if (mode === "object") prompt = "Identify the specific object the user is pointing at. One short sentence.";
    if (mode === "money") prompt = "Identify any Sri Lankan currency visible. State denomination. If none visible, say so.";

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
        ]}],
        max_tokens: 100,
      }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || "Vision failed" });
    res.json({ description: d.choices?.[0]?.message?.content || "I couldn't make that out." });
  } catch(e) { res.status(500).json({ error: "Vision error" }); }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Cyber v4 running on port ${PORT}`));
