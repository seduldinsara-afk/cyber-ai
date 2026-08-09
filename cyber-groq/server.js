// ============================================================
// CYBER — free version, powered by Groq
// ============================================================
// Voice IN and OUT happen entirely in the phone's browser
// (Safari's built-in speech recognition + speech synthesis —
// both free, no API needed for those).
//
// This server's only job: take the text the phone heard,
// send it to Groq for a reply, send the reply text back.
// Your GROQ_API_KEY lives only here, never in the browser.
// ============================================================

const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error("ERROR: GROQ_API_KEY is not set in Railway Variables.");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const GROQ_MODEL = "llama-3.3-70b-versatile";

const CYBER_INSTRUCTIONS = `You are Cyber, a futuristic personal voice assistant.
Speak naturally, like a real conversation, not a chatbot.
Be concise, confident, friendly, and fast. Never say "As an AI...".
Keep replies short (1-3 sentences) unless the user asks for detail,
since your reply will be spoken out loud.`;

// Keep short rolling memory per request from the browser
// (browser sends the recent conversation each time — simplest
// way to get context without a database).
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Cyber (Groq) server running on port ${PORT}`);
});
