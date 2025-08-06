import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(cors({
  origin: 'https://baldandbad.github.io', // Your GitHub Pages site
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY;

app.post("/ask", async (req, res) => {
  const userMsg = req.body.message;
  const payload = {
    model: "mistralai/mistral-7b-instruct", // or any model OpenRouter supports
    messages: [{ role: "user", content: userMsg }],
  };

  try {
    const openRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://baldandbad.github.io/", // optional but helps with OpenRouter limits
      },
      body: JSON.stringify(payload),
    });

    const data = await openRes.json();
    res.json({ reply: data.choices?.[0]?.message?.content || "No reply." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error talking to OpenRouter" });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server ready 🚀")
);
