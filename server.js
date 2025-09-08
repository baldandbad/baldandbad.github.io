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
const io = new Server(server, {
  cors: {
    origin: ["https://https://baldandbad.github.io/"], // your frontend domain
    methods: ["GET", "POST"],
    credentials: true
  }
});


const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY;

// AI endpoint
app.post("/ask", async (req, res) => {
  const userMsg = req.body.message;
  const payload = {
    model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
    messages: [
      { role: "system", content: "Tiếng Việt" },
      { role: "user", content: userMsg }
    ]
  };

  try {
    const openRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
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

app.use("/comments", commentsRouter);

app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

// get all quizzes
app.get("/api/quizzes", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, title FROM quizzes ORDER BY id");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// get one quiz
app.get("/api/quizzes/:id", async (req, res) => {
  try {
    const quizId = req.params.id;

    const qRes = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option
       FROM questions
       WHERE quiz_id = $1
       ORDER BY id`,
      [quizId]
    );

    const questions = qRes.rows.map(q => ({
      id: q.id,
      question: q.question_text,
      answers: [
        { id: "A", text: q.option_a },
        { id: "B", text: q.option_b },
        { id: "C", text: q.option_c },
        { id: "D", text: q.option_d }
      ],
      correctAnswerId: q.correct_option
    }));

    res.json(questions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- Multiplayer with Socket.IO ---------- */

const rooms = new Map();

io.on("connection", (socket) => {
  // host creates a room
  socket.on("createRoom", async ({ quizId }) => {
  try {
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();

    const qRes = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option
       FROM questions
       WHERE quiz_id=$1
       ORDER BY id`,
      [quizId]
    );

    if (qRes.rows.length === 0) {
      return socket.emit("error", "No questions found for this quiz");
    }

    const questions = qRes.rows.map(q => ({
      id: q.id,
      text: q.question_text,
      answers: [
        { id: "A", text: q.option_a, is_correct: q.correct_option === "A" },
        { id: "B", text: q.option_b, is_correct: q.correct_option === "B" },
        { id: "C", text: q.option_c, is_correct: q.correct_option === "C" },
        { id: "D", text: q.option_d, is_correct: q.correct_option === "D" }
      ]
    }));

    rooms.set(code, { hostId: socket.id, players: [], questions, index: -1 });
    socket.join(code);
    socket.emit("roomCreated", { code });
  } catch (err) {
    console.error("createRoom error:", err.message);
    socket.emit("error", "Failed to create room");
  }
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

  // prevent multiple answers for same question
  if (player.lastAnsweredIndex === room.index) return;

  const q = room.questions[room.index];
  if (!q) return;

  // find the chosen answer (A/B/C/D)
  const ans = q.answers.find(a => a.id === answerId);
  if (!ans) return;

  if (ans.is_correct) {
    player.score += 10;
  }
  player.lastAnsweredIndex = room.index;

  io.to(code).emit("updateScores", room.players.map(p => ({
    name: p.name,
    score: p.score
  })));
});


  // cleanup
  socket.on("disconnect", () => {
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
  io.to(code).emit("question", {
    id: q.id,
    question: q.text, // 👈 matches REST
    answers: q.answers.map(a => ({ id: a.id, text: a.text })),
    correctAnswerId: q.answers.find(a => a.is_correct)?.id || null // 👈 so frontend can check
  });
}


/* -------------------- start -------------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
