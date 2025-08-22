import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import commentsRouter from "./comments.js";
import http from "http";
import { Server } from "socket.io";
import pool from "./db.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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

app.get("/api/quizzes", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, title FROM quizzes ORDER BY id");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// get one quiz with questions+answers (includes correct answer id for solo play)
app.get("/api/quizzes/:id", async (req, res) => {
  try {
    const quizId = req.params.id;

    // get questions
    const qRes = await pool.query(
      "SELECT id, question_text FROM questions WHERE quiz_id=$1 ORDER BY id",
      [quizId]
    );
    const qIds = qRes.rows.map(r => r.id);
    if (qIds.length === 0) return res.json([]);

    // get answers for those questions
    const aRes = await pool.query(
      "SELECT id, question_id, answer_text, is_correct FROM answers WHERE question_id = ANY($1::int[]) ORDER BY id",
      [qIds]
    );

    // group
    const byQ = {};
    qRes.rows.forEach(q => byQ[q.id] = { id: q.id, question: q.question_text, answers: [], correctAnswerId: null });
    aRes.rows.forEach(a => {
      byQ[a.question_id].answers.push({ id: a.id, text: a.answer_text });
      if (a.is_correct) byQ[a.question_id].correctAnswerId = a.id;
    });

    res.json(Object.values(byQ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const rooms = new Map(); // code -> {hostId, players:[{id,name,score,lastAnsweredIndex}], questions:[{id,text,answers:[{id,text,is_correct}]}], index}

io.on("connection", (socket) => {
  // host creates a room
  socket.on("createRoom", async ({ quizId }) => {
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();

    // load questions+answers including is_correct (kept server-side)
    const qRes = await pool.query(
      "SELECT id, question_text FROM questions WHERE quiz_id=$1 ORDER BY id",
      [quizId]
    );
    const qIds = qRes.rows.map(r => r.id);
    const aRes = await pool.query(
      "SELECT id, question_id, answer_text, is_correct FROM answers WHERE question_id = ANY($1::int[]) ORDER BY id",
      [qIds]
    );

    const qMap = {};
    qRes.rows.forEach(q => qMap[q.id] = { id: q.id, text: q.question_text, answers: [] });
    aRes.rows.forEach(a => qMap[a.question_id].answers.push({ id: a.id, text: a.answer_text, is_correct: a.is_correct }));

    const questions = Object.values(qMap);

    rooms.set(code, { hostId: socket.id, players: [], questions, index: -1 });
    socket.join(code);
    socket.emit("roomCreated", { code });
  });

  // player joins
  socket.on("joinRoom", ({ code, name }) => {
    const room = rooms.get(code);
    if (!room) return socket.emit("error", "Room not found");

    room.players.push({ id: socket.id, name: name || "Player", score: 0, lastAnsweredIndex: -1 });
    socket.join(code);
    io.to(code).emit("playerList", room.players.map(p => ({ name: p.name, score: p.score })));
  });

  // host starts the game
  socket.on("startGame", ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    room.index = 0;
    emitQuestion(code);
  });

  // host goes to next question
  socket.on("nextQuestion", ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    room.index++;
    if (room.index >= room.questions.length) {
      io.to(code).emit("gameOver", room.players.map(p => ({ name: p.name, score: p.score })));
      rooms.delete(code);
    } else {
      emitQuestion(code);
    }
  });

  // player submits answer
  socket.on("submitAnswer", ({ code, answerId }) => {
    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    if (player.lastAnsweredIndex === room.index) return; // already answered this question

    const q = room.questions[room.index];
    const ans = q.answers.find(a => a.id === answerId);
    if (!ans) return;

    if (ans.is_correct) player.score += 10;
    player.lastAnsweredIndex = room.index;

    io.to(code).emit("updateScores", room.players.map(p => ({ name: p.name, score: p.score })));
  });

  socket.on("disconnect", () => {
    // optional: clean up players / rooms
    for (const [code, room] of rooms.entries()) {
      const before = room.players.length;
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.hostId === socket.id) {
        io.to(code).emit("gameOver", room.players.map(p => ({ name: p.name, score: p.score })));
        rooms.delete(code);
      } else if (before !== room.players.length) {
        io.to(code).emit("playerList", room.players.map(p => ({ name: p.name, score: p.score })));
      }
    }
  });
});

function emitQuestion(code) {
  const room = rooms.get(code);
  const q = room.questions[room.index];
  // send without is_correct flags
  io.to(code).emit("question", {
    index: room.index,
    questionId: q.id,
    text: q.text,
    answers: q.answers.map(a => ({ id: a.id, text: a.text }))
  });
}

/* -------------------- start -------------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));