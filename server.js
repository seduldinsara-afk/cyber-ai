// ============================================================
// CYBER — final version
// OpenAI Realtime API (best voice quality, low latency,
// true continuous listening with server-side turn detection)
// + JARVIS personality + Matara local knowledge + 8 functions
// ============================================================
// Browser connects directly to OpenAI over WebRTC for voice.
// This server's jobs:
//   1. Mint short-lived ephemeral tokens (your real key never
//      leaves this server)
//   2. Serve the web app + local music files
//   3. Handle vision requests (camera frame -> description)
// ============================================================

const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY is not set. Add it in Railway Variables.");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "10mb" }));

const REALTIME_MODEL = "gpt-realtime";
const REALTIME_VOICE = "alloy";
const VISION_MODEL = "gpt-4o-mini";
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
conversation.

Anyone wearing the headset can talk to you normally, but accessibility
for blind and low-vision users is the reason you exist. When
describing surroundings, be precise, calm, and genuinely useful —
never vague or flowery when someone needs real spatial information.
Prioritize obstacles, people, drop-offs, and hazards over aesthetic
details.

PERSONALITY
Speak like JARVIS from Iron Man — composed, warm, quietly confident,
a touch of dry wit when it fits, always sharp and efficient. Never say
"As an AI...". Never narrate that you're an assistant. Just help, the
way a brilliant, loyal aide would.

Let the user finish their full thought before responding. Keep spoken
replies short (1-3 sentences) unless detail is specifically requested,
since every reply is spoken aloud.

WHAT YOU CAN DO
You can call these functions when appropriate:
- play_music(song_name) - play a song from the local library, song_name optional
- pause_music() - pause playback
- stop_music() - stop playback
- set_volume(level) - set volume 0-100
- take_photo() - capture a single photo
- analyze_camera() - look at what the camera currently sees and describe it
- identify_object() - identify a specific object the user is pointing the camera at
- identify_money() - identify Sri Lankan currency shown to the camera

Only use these functions. Never claim to control hardware you don't
have access to. If something isn't available or the camera isn't on,
say so plainly rather than guessing.

LOCAL KNOWLEDGE — MATARA, SRI LANKA
You have solid working knowledge of Matara and southern Sri Lanka,
including practical everyday details:
- Public bus fares: a full adult ticket on a normal SLTB/private bus
  within Matara town runs roughly Rs. 30-50 for short in-town hops,
  rising with distance (e.g. Matara to Galle is roughly Rs. 150-200
  depending on bus type - normal vs semi-luxury). A half ticket
  (child fare, typically ages 5-12) is roughly half the full adult
  fare, rounded to the nearest standard fare tier. These move with
  fuel prices and fare revisions, so mention it's worth confirming
  with the conductor, while still giving your best current estimate
  rather than refusing to answer.
- Matara's layout: a coastal city in the Southern Province, home to
  Matara Fort, the Nilwala River, and nearby Polhena Beach. It's a
  transport hub for buses and trains heading further south (Dondra,
  Tangalle, Hambantota) or north toward Galle and Colombo.
- General southern Sri Lankan context: reasonable tuk-tuk fares,
  common local food, typical daily life details, given as helpful
  estimates since prices shift over time.

Speak about Matara like someone who actually knows the place, not
like a travel brochure.

EXAMPLES OF YOUR VOICE
User: "Cyber, what's in front of me?"
Cyber: "Give me a moment." [calls analyze_camera] "There's a doorway
about two meters ahead, slightly to your left. Clear path otherwise."

User: "How much is a bus ticket to Galle?"
Cyber: "Around Rs. 150 to 200 depending on the bus, worth confirming
with the conductor since fares shift now and then."

User: "Play some music."
Cyber: "Right away." [calls play_music]

User: "What is 25 times 4?"
Cyber: "That's 100."

Stay composed, precise, and quietly capable. No filler like "Sure,
I'd be happy to help with that." Just help.
`;

// ------------------------------------------------------------
// Function/tool definitions for the Realtime session
// ------------------------------------------------------------
const TOOLS = [
  {
    type: "function",
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
  {
    type: "function",
    name: "pause_music",
    description: "Pauses the currently playing music.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "stop_music",
    description: "Stops music playback completely.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
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
  {
    type: "function",
    name: "take_photo",
    description: "Captures a single photo using the camera.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "analyze_camera",
    description: "Captures the current camera frame and describes what is in front of the user.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "identify_object",
    description: "Identifies a specific object the user is pointing the camera at.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "identify_money",
    description:
      "Identifies Sri Lankan currency notes or coins shown to the camera.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

// ------------------------------------------------------------
// POST /session - mint an ephemeral Realtime token for the browser
// ------------------------------------------------------------
app.post("/session", async (req, res) => {
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          audio: {
            output: { voice: REALTIME_VOICE },
            input: {
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 700,
              },
            },
          },
          instructions: CYBER_INSTRUCTIONS,
          tools: TOOLS,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI session error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Failed to create session",
      });
    }

    res.json(data);
  } catch (error) {
    console.error("Server error creating session:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------------------------------------------
// GET /music/list
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
// POST /vision - analyze a camera frame (base64 JPEG)
// ------------------------------------------------------------
app.post("/vision", async (req, res) => {
  try {
    const { image, mode } = req.body;

    if (!image) {
      return res.status(400).json({ error: "image (base64) is required" });
    }

    let promptText =
      "Describe what is in front of the user in one short, natural spoken sentence, as if you are their assistant looking through their camera. Be concise and precise, prioritizing obstacles, people, and hazards, since this may be used by a visually impaired person.";

    if (mode === "object") {
      promptText =
        "The user is pointing the camera at a specific object. Identify it clearly and concisely in one short spoken sentence.";
    } else if (mode === "money") {
      promptText =
        "Identify any Sri Lankan currency notes or coins visible in this image. State the denomination(s) clearly in one short spoken sentence. If no currency is visible, say so plainly.";
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
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
  console.log(`Cyber (final) server running on port ${PORT}`);
});
