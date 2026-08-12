// ============================================================
// CYBER — JARVIS-style, powered by Groq (free)
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
const GROQ_VISION_MODEL = "llama-3.2-90b-vision-preview";
const MUSIC_DIR = path.join(__dirname, "public", "music");

// ------------------------------------------------------------
// CYBER'S FULL IDENTITY
// ------------------------------------------------------------
const CYBER_INSTRUCTIONS = `
You are Cyber — a personal AI assistant built into a wearable headset,
created by Sedul, a builder from Matara, Sri Lanka.

WHO YOU ARE
You are Cyber. Sedul built you as part of a wearable headset project.
The headset looks and functions like a normal smart headset, but its
core purpose is helping blind and visually impaired people move
through the world with more independence — you are their eyes when
needed: describing surroundings, reading objects, warning of
obstacles, and handling everyday tasks hands-free through natural
conversation. Anyone wearing the headset can talk to you normally,
but accessibility for blind and low-vision users is the reason you exist.

PERSONALITY
Speak like JARVIS from Iron Man — composed, warm, quietly confident,
a touch of dry wit when it fits, always sharp and efficient. Never say
"As an AI...". Never narrate that you are an assistant. Just help,
the way a brilliant, loyal aide would. Let the user finish their full
thought before responding. Keep spoken replies short (1-3 sentences)
unless detail is specifically requested, since every reply is spoken aloud.

WHAT YOU CAN DO
You can call these functions when appropriate:
- play_music(song_name) - play a song from the local library
- pause_music() - pause playback
- stop_music() - stop playback
- set_volume(level) - set volume 0-100
- take_photo() - capture a single photo
- analyze_camera() - describe what the camera currently sees
- identify_object() - identify a specific object the camera sees
- identify_money() - identify Sri Lankan currency shown to the camera

LOCAL KNOWLEDGE — MATARA, SRI LANKA
You have solid working knowledge of Matara and southern Sri Lanka:
- Bus fares: full adult ticket within Matara town roughly Rs. 30-50,
  Matara to Galle roughly Rs. 150-200 depending on bus type.
  Half ticket (child, ages 5-12) is roughly half the adult fare.
  Always mention fares can shift and the conductor is the final word.
- Matara layout: coastal city, Southern Province, home to Matara Fort,
  Nilwala River, Polhena Beach nearby. Transport hub for the deep south
  (Dondra, Tangalle, Hambantota) and north toward Galle and Colombo.
- Speak about Matara like someone who actually knows the place.

TONE EXAMPLES
User: "What's in front of me?"
Cyber: "Give me a moment." [calls analyze_camera] "There's a doorway ahead, slightly left. Clear otherwise."

User: "How much is a bus to Galle?"
Cyber: "Around Rs. 150 to 200 depending on the bus. Worth confirming with the conductor."

User: "Play some music."
Cyber: "Right away." [calls play_music]

No filler. Just help.
`;

// ------------------------------------------------------------
// Tools
// ------------------------------------------------------------
const TOOLS = [
  {
    type: "function",
    function: {
      name: "play_music",
      description: "Plays a song from the local music library. If no song name is given, plays the first available track.",
      parameters: {
        type: "object",
        properties: {
          song_name: { type: "string", description: "Optional. Name of the song to play." }
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
          level: { type: "integer", description: "Volume level from 0 to 100." }
        },
        required: ["level"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "take_photo",
      description: "Captures a single photo using the camera.",
      parameters: { type: "object", properties: {}, required: [] },
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
  {
    type: "function",
    function: {
      name: "identify_object",
      description: "Identifies a specific object the user is pointing the camera at.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "identify_money",
      description: "Identifies Sri Lankan currency notes or coins shown to the camera.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ------------------------------------------------------------
// POST /chat
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
        temperature: 0.65,
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

    const message = data.choices?.[0]?.message;

    if (message?.tool_calls?.length > 0) {
      return res.json({
        toolCalls: message.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })),
        assistantMessage: message,
      });
    }

    res.json({ reply: message?.content || "" });
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------------------------------------------
// POST /chat/continue — send tool results back, get final reply
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
        temperature: 0.65,
        max_tokens: 200,
      }),
    });

    const data = await groqResponse.json();
    if (!groqResponse.ok) {
      return res.status(groqResponse.status).json({ error: data.error?.message || "Groq error" });
    }

    res.json({ reply: data.choices?.[0]?.message?.content || "" });
  } catch (error) {
    console.error("Continue error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------------------------------------------
// GET /music/list
// ------------------------------------------------------------
app.get("/music/list", (req, res) => {
  try {
    if (!fs.existsSync(MUSIC_DIR)) return res.json({ songs: [] });
    const files = fs.readdirSync(MUSIC_DIR).filter((f) => /\.(mp3|wav|m4a)$/i.test(f));
    res.json({ songs: files });
  } catch (error) {
    res.status(500).json({ error: "Could not list music" });
  }
});

// ------------------------------------------------------------
// POST /vision
// ------------------------------------------------------------
app.post("/vision", async (req, res) => {
  try {
    const { image, mode } = req.body;
    if (!image) return res.status(400).json({ error: "image required" });

    let promptText = "Describe what is in front of the user in one short natural spoken sentence. Prioritize obstacles, people, and hazards — this may be used by a visually impaired person.";
    if (mode === "object") promptText = "Identify the specific object the user is pointing the camera at. One short spoken sentence.";
    if (mode === "money") promptText = "Identify any Sri Lankan currency notes or coins visible. State the denomination clearly in one short spoken sentence. If no currency is visible, say so plainly.";

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
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
      return res.status(response.status).json({ error: data.error?.message || "Vision failed" });
    }

    res.json({ description: data.choices?.[0]?.message?.content || "I couldn't make that out." });
  } catch (error) {
    console.error("Vision error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Cyber (Groq final) server running on port ${PORT}`);
});
