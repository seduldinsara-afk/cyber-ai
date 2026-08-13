// ============================================================
// CYBER v3 — Groq powered, no hold button, warm start
// ============================================================
const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error("ERROR: GROQ_API_KEY is not set.");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "10mb" }));

const MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "llama-3.2-90b-vision-preview";
const MUSIC_DIR = path.join(__dirname, "public", "music");

const SYSTEM = `You are Cyber — a personal AI assistant built into a wearable headset created by Sedul, a builder from Matara, Sri Lanka.

WHO YOU ARE
Sedul built you for a wearable headset whose core purpose is helping blind and visually impaired people navigate the world independently — you are their eyes: describing surroundings, identifying objects, warning of hazards, handling tasks hands-free. Anyone can use the headset, but accessibility is why you exist.

PERSONALITY
Speak like JARVIS — composed, warm, quietly confident, sharp, efficient. A touch of dry wit when it fits. Never say "As an AI". Never explain yourself. Just help. Keep replies to 1-3 sentences since they are spoken aloud. Let the user finish their full thought before responding.

FUNCTIONS YOU CAN CALL
- play_music(song_name) — play from local library, song_name optional
- pause_music() — pause
- stop_music() — stop
- set_volume(level) — 0 to 100
- analyze_camera() — describe what camera sees
- identify_object() — identify specific object camera sees
- identify_money() — identify Sri Lankan currency in camera

LOCAL KNOWLEDGE — MATARA, SRI LANKA
- Bus fares: within Matara town roughly Rs. 30-50. Matara to Galle roughly Rs. 150-200 (normal vs semi-luxury). Half ticket (child, ages 5-12) roughly half adult fare. Always mention fares can change — conductor has final word.
- Matara: coastal city, Southern Province. Matara Fort, Nilwala River, Polhena Beach. Hub for buses/trains south to Dondra, Tangalle, Hambantota and north to Galle, Colombo.
- Speak about Matara like someone who lives there, not a travel guide.

STYLE
User: "What's in front of me?" → Cyber: "Give me a moment." [analyze_camera] "Doorway ahead, slightly left. Clear path otherwise."
User: "Bus fare to Galle?" → Cyber: "Around Rs. 150 to 200, depending on the bus. Confirm with the conductor."
User: "Play music." → Cyber: "Right away." [play_music]
No filler. No "Sure, I'd be happy to help." Just help.`;

const TOOLS = [
  { type:"function", function:{ name:"play_music", description:"Play a song from local library. song_name optional.", parameters:{ type:"object", properties:{ song_name:{type:"string"} }, required:[] } } },
  { type:"function", function:{ name:"pause_music", description:"Pause music.", parameters:{type:"object",properties:{},required:[]} } },
  { type:"function", function:{ name:"stop_music", description:"Stop music.", parameters:{type:"object",properties:{},required:[]} } },
  { type:"function", function:{ name:"set_volume", description:"Set volume 0-100.", parameters:{type:"object",properties:{level:{type:"integer"}},required:["level"]} } },
  { type:"function", function:{ name:"analyze_camera", description:"Describe what camera sees.", parameters:{type:"object",properties:{},required:[]} } },
  { type:"function", function:{ name:"identify_object", description:"Identify specific object in camera.", parameters:{type:"object",properties:{},required:[]} } },
  { type:"function", function:{ name:"identify_money", description:"Identify Sri Lankan currency in camera.", parameters:{type:"object",properties:{},required:[]} } },
];

async function groqChat(messages, useTools = true) {
  const body = {
    model: MODEL,
    messages: [{ role:"system", content:SYSTEM }, ...messages],
    temperature: 0.65,
    max_tokens: 250,
  };
  if (useTools) { body.tools = TOOLS; body.tool_choice = "auto"; }

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization:`Bearer ${GROQ_API_KEY}`, "Content-Type":"application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// Warm up Groq on server start so first user request is fast
(async () => {
  try {
    await groqChat([{ role:"user", content:"ping" }], false);
    console.log("Groq warmed up.");
  } catch(e) { console.log("Warm-up skipped:", e.message); }
})();

// POST /chat
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error:"messages required" });

    const data = await groqChat(messages);
    if (data.error) return res.status(500).json({ error: data.error.message });

    const msg = data.choices?.[0]?.message;
    if (msg?.tool_calls?.length) {
      return res.json({
        toolCalls: msg.tool_calls.map(tc => ({ id:tc.id, name:tc.function.name, arguments:tc.function.arguments })),
        assistantMessage: msg,
      });
    }
    res.json({ reply: msg?.content || "" });
  } catch(e) {
    console.error("Chat error:", e.message);
    res.status(500).json({ error:"Server error" });
  }
});

// POST /chat/continue
app.post("/chat/continue", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error:"messages required" });
    const data = await groqChat(messages, false);
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.json({ reply: data.choices?.[0]?.message?.content || "" });
  } catch(e) {
    res.status(500).json({ error:"Server error" });
  }
});

// GET /music/list
app.get("/music/list", (req, res) => {
  try {
    if (!fs.existsSync(MUSIC_DIR)) return res.json({ songs:[] });
    const songs = fs.readdirSync(MUSIC_DIR).filter(f => /\.(mp3|wav|m4a)$/i.test(f));
    res.json({ songs });
  } catch(e) { res.status(500).json({ error:"Could not list music" }); }
});

// POST /vision
app.post("/vision", async (req, res) => {
  try {
    const { image, mode } = req.body;
    if (!image) return res.status(400).json({ error:"image required" });

    let prompt = "Describe what is in front of the user in one short natural sentence. Prioritize obstacles, people, hazards — may be used by a visually impaired person.";
    if (mode === "object") prompt = "Identify the specific object the user is pointing at. One short sentence.";
    if (mode === "money") prompt = "Identify any Sri Lankan currency visible. State denomination clearly. If none, say so.";

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:"POST",
      headers:{ Authorization:`Bearer ${GROQ_API_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages:[{ role:"user", content:[
          { type:"text", text:prompt },
          { type:"image_url", image_url:{ url:`data:image/jpeg;base64,${image}` } },
        ]}],
        max_tokens: 100,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || "Vision failed" });
    res.json({ description: data.choices?.[0]?.message?.content || "I couldn't make that out." });
  } catch(e) {
    res.status(500).json({ error:"Vision server error" });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Cyber v3 running on port ${PORT}`));
