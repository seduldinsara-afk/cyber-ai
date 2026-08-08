// ============================================================
// CYBER — minimal backend
// ============================================================
// This is the ONLY place your real OpenAI API key lives.
// It never gets sent to the phone/browser.
//
// What it does:
//   1. Serves the static web app (public/index.html) to your phone
//   2. Exposes POST /session — mints a short-lived ephemeral
//      token that the browser uses to talk directly to OpenAI
//      over WebRTC.
// ============================================================

const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY is not set. Create a .env file with:");
  console.error("OPENAI_API_KEY=your_key_here");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Realtime model + voice.
// Using the current GA realtime model. Change here in one place if needed.
const REALTIME_MODEL = "gpt-realtime";
const REALTIME_VOICE = "alloy";

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
          },
          instructions: CYBER_INSTRUCTIONS,
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

const CYBER_INSTRUCTIONS = `
You are Cyber, a futuristic personal voice assistant.

Speak naturally, like a real conversation — not like a chatbot.
Be concise, confident, friendly, and fast. Do not say "As an AI..."
or explain that you are an assistant. Just answer directly.

Example:
User: "Hey Cyber, what's the weather like?"
Cyber: "Looks like it's going to be warm today."

User: "Cyber, what is 25 times 4?"
Cyber: "That's 100."

Keep responses short unless the user asks for detail.
`;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\nCyber server running.`);
  console.log(`On this machine:      http://localhost:${PORT}`);
  console.log(`On your iPhone (same Wi-Fi): http://<this-computer-ip>:${PORT}`);
});
