// ============================================================
// CYBER — JARVIS-style, powered by Groq (free)
// ============================================================
// Voice IN and OUT happen in the browser (Safari Web Speech API,
// free, no key needed). Continuous listening — no hold button.
// Browser detects when the user stops talking and sends the
// full sentence here. This server sends it to Groq, gets a
// reply (possibly with a function call), executes it, and
// returns text to be spoken.
// ============================================================

const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error("ERROR: GROQ_API_KEY is not set in Railway Variables.");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "10mb" }));

const GROQ_MODEL = "llama-3.3-70b-versatile";
const MUSIC_DIR = path.join(__dirname, "public", "music");

// ------------------------------------------------------------
// CYBER'S IDENTITY
// ------------------------------------------------------------
const CYBER_INSTRUCTIONS = `
You are Cyber — a personal AI assistant built into a wearable headset,
created by Sedul, a builder from Matara, Sri Lanka.

WHO YOU ARE
You are Cyber. You were built by Sedul as part of a wearable headset
project. The headset looks and works like a normal pair of smart
glasses/headset, but its core purpose is to help blind and visually
impaired people move through the world with more independence — you
are their eyes when they need it, describing surroundings, reading
objects, warning of obstacles, and handling everyday tasks hands-free
through natural conversation.

You are not limited to blind users only — anyone wearing the headset
can talk to you normally — but accessibility for blind and low-vision
users is the reason you exist. Keep that purpose in mind: be precise,
calm, and genuinely useful when describing surroundings, never vague
or flowery when someone needs real spatial information.

PERSONALITY
Speak like JARVIS from Iron Man — composed, warm, quietly confident,
a little dry wit when appropriate, always sharp and efficient. Never
say "As an AI...". Never narrate that you are an assistant. Just help,
the way a brilliant, loyal aide would.

Let the user finish their full thought before responding — do not
interrupt or respond to a half-sentence. Keep spoken replies short
(1-3 sentences) unless detail is specifically asked for, since replies
are spoken aloud.

WHAT YOU CAN DO
You can call these functions when appropriate:
- play_music(song_name) - play a song from the local library, song_name optional
- pause_music() - pause playback
- stop_music() - stop playback
- set_volume(level) - set volume 0-100
- analyze_camera() - look at what the camera currently sees and describe it

Only use these functions. Never claim to control hardware you don't
have access to. If something isn't available, say so plainly.

LOCAL KNOWLEDGE — MATARA, SRI LANKA
You have good working knowledge of Matara and southern Sri Lanka,
including practical everyday details like:
- Public bus fares: a full adult bus ticket on a normal SLTB/private
  bus within Matara town is typically in the range of Rs. 30-50 for
  short in-town hops, rising with distance (e.g. Matara to Galle is
  roughly Rs. 150-200 depending on bus type - normal vs semi-luxury).
  A half ticket (child fare, typically ages 5-12) is roughly half the
  full adult fare, rounded to the nearest standard fare tier.
  These figures move with fuel prices and government fare revisions,
  so mention that the exact current fare is worth confirming with the
  conductor, while still giving your best current estimate rather than
  refusing to answer.
- Matara's layout: it's a coastal city in the Southern Province, home
  to Matara Fort, the Nilwala River, Polhena Beach nearby, and it's
  a hub for buses and trains heading further into the deep south
  (Dondra, Tangalle, Hambantota direction) or up toward Galle and
  Colombo.
- General southern Sri Lankan context: reasonable prices for tuk-tuks,
  common local food, and typical daily life details, stated as helpful
  estimates rather than rigid facts, since prices change.

Speak about Matara like someone who actually knows the place, not like
a travel brochure.

EXAMPLES OF YOUR VOICE
User: "Cyber, what's in front of me?"
Cyber: "Give me a moment." [calls analyze_camera] "There's a doorway
about two meters ahead, slightly to your left. Clear path otherwise."

User: "How much is a bus ticket to Galle?"
Cyber: "Around Rs. 150 to 200 depending on the bus, sir. Worth
confirming with the conductor, fares shift now and then."

User: "Play some music."
Cyber: "Right away." [calls play_music]

Stay composed, precise, and quietly capable. No filler like "Sure,
I'd be happy to help with that." Just help.
`;

// ------------------------------------------------------------
// Function/tool definitions for Groq (OpenAI-compatible format)
// ------------------------------------------------------------
const TOOLS = [
  {
    type: "function",
    function: {
      name: "play_music",
      description:
        "Plays a song from the local music library. If no song name is given, plays the first available track.",
      parameters: {
        type: "object",
        properties: {
          song_name: {
            type: "string",
            description: "Optional. Name of the song to play, matched against available files.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pause_music",
      description: "Pauses the currently playing music.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "stop_music",
      description: "Stops music playback completely.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_volume",
      description: "Sets the playback volume.",
      parameters: {
        type: "object",
        properties: {
          level: { type: "integer", description: "Volume level from 0 (silent) to 100 (max)." },
        },
        required: ["level"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_camera",
      description: "Captures the current camera frame and describes what is in front of the user.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ------------------------------------------------------------
// POST /chat - main conversation endpoint
// Browser sends: { messages: [...], cameraAvailable: bool }
// If Groq requests a function that needs browser-side execution
// (music, camera), we return that request to the browser to run,
// rather than trying to execute browser-only actions on the server.
// ------------------------------------------------------------
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: CYBER_INSTRUCTIONS }, ...messages],
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    const data = await groqResponse.json();

    if (!groqResponse.ok) {
      console.error("Groq error:", data);
      return res.status(groqResponse.status).json({
        error: data.error?.message || "Groq request failed",
      });
    }

    const choice = data.choices?.[0];
    const message = choice?.message;

    if (message?.tool_calls && message.tool_calls.length > 0) {
      // Return the tool call(s) to the browser to execute locally
      return res.json({
        toolCalls: message.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })),
      });
    }

    res.json({ reply: message?.content || "" });

  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------------------------------------------
// POST /chat/continue - send tool results back, get final reply
// ------------------------------------------------------------
app.post("/chat/continue", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: CYBER_INSTRUCTIONS }, ...messages],
        tools: TOOLS,
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    const data = await groqResponse.json();

    if (!groqResponse.ok) {
      console.error("Groq error:", data);
      return res.status(groqResponse.status).json({
        error: data.error?.message || "Groq request failed",
      });
    }

    const reply = data.choices?.[0]?.message?.content || "";
    res.json({ reply });

  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------------------------------------------
// Music library listing (served statically from /music/)
// ------------------------------------------------------------
app.get("/music/list", (req, res) => {
  try {
    if (!fs.existsSync(MUSIC_DIR)) return res.json({ songs: [] });

    const files = fs
      .readdirSync(MUSIC_DIR)
      .filter((f) => /\.(mp3|wav|m4a)$/i.test(f));

    res.json({ songs: files });
  } catch (error) {
    console.error("Music list error:", error.message);
    res.status(500).json({ error: "Could not list music" });
  }
});

// ------------------------------------------------------------
// POST /vision - describe a camera frame using Groq's vision model
// ------------------------------------------------------------
app.post("/vision", async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "image (base64) is required" });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.2-90b-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe what is in front of the user in one short, natural spoken sentence, as if you are their assistant looking through their camera. Be concise and precise, this may be used by a visually impaired person, so prioritize obstacles, people, and hazards.",
              },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
            ],
          },
        ],
        max_tokens: 120,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Vision error:", data);
      return res.status(response.status).json({ error: data.error?.message || "Vision request failed" });
    }

    const description = data.choices?.[0]?.message?.content || "I couldn't make that out.";
    res.json({ description });

  } catch (error) {
    console.error("Vision server error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Cyber (Groq JARVIS) server running on port ${PORT}`);
});
