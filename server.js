import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import commentsRouter from "./comments.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY;
console.log("API key loaded?", !!API_KEY);

app.post("/ask", async (req, res) => {
  const userMsg = req.body.message;
  console.log("User message:", userMsg);
  const payload = {
    model: "deepseek/deepseek-r1-0528-qwen3-8b:free", // or any model OpenRouter supports
    messages: [
      { role: "system", content: "Tiếng Việt" },
      { role: "user", content: userMsg}
    ]
  };

  try {
    const openRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json", // optional but helps with OpenRouter limits
      },
      body: JSON.stringify(payload),
    });

    const data = await openRes.json();
    console.log("OpenRouter raw response:", data);
    res.json({ reply: data.choices?.[0]?.message?.content || " No reply." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error talking to OpenRouter" });
  }
});

app.use("/comments", commentsRouter);

app.get("/", (req, res) => {
    res.send("Backend for comments is running ✅");
});

app.get('/', (req, res) => {
  res.send('AI backend is running!');
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server ready 🚀")
);

