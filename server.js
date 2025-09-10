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
    origin: ["https://baldandbad.github.io/"], // your frontend domain
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
  console.log('[socket] connected', socket.id);

  socket.on("createRoom", async (payload) => {
  try {
    const quizId = (payload && (payload.quizId ?? payload.qid)) ?? payload;
    console.log('[createRoom] from', socket.id, 'quizId=', quizId);
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();

    const qRes = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option
       FROM questions WHERE quiz_id=$1 ORDER BY id`,
      [quizId]
    );

    if (!qRes.rows.length) {
      socket.emit('error', 'No questions found for this quiz');
      return;
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

    // add host as first player so the host can also play
    const room = { hostId: socket.id, players: [{ id: socket.id, name: 'Host', score: 0, lastAnsweredIndex: -1 }], questions, index: -1 };
    rooms.set(code, room);
    socket.join(code);

    console.log('[createRoom] created', code, 'host=', socket.id);
    socket.emit("roomCreated", { code });
    // broadcast initial player list (host only for now)
    io.to(code).emit('playerList', room.players.map(p => ({ name: p.name, score: p.score })));
  } catch (err) {
    console.error("createRoom error:", err);
    socket.emit("error", "Failed to create room");
  }
});

  // Accept multiple payload shapes (code || roomId || payload)
  socket.on("joinRoom", (payload) => {
  const code = (payload && (payload.code ?? payload.roomId)) || payload;
  const name = payload && (payload.name ?? payload.player) || 'Player';
  console.log('[joinRoom]', socket.id, '->', code, name);

  const room = rooms.get(code);
  if (!room) {
    socket.emit('error', 'Room not found: ' + String(code));
    return;
  }

  room.players.push({ id: socket.id, name, score: 0, lastAnsweredIndex: -1 });
  socket.join(code);
  io.to(code).emit("playerList", room.players.map(p => ({ name: p.name, score: p.score })));
  socket.emit('roomJoined', { code });
});

  socket.on("submitAnswer", (payload) => {
  const code = (payload && (payload.code ?? payload.roomId)) || payload.code || payload.roomId || payload;
  const answerId = payload && (payload.answerId ?? payload.answer) ?? payload.answerId ?? payload.answer;
  console.log('[submitAnswer] from', socket.id, 'code=', code, 'answerId=', answerId);

  const room = rooms.get(code);
  if (!room) {
    socket.emit('error', 'Room not found: ' + String(code));
    return;
  }

  const player = room.players.find(p => p.id === socket.id);
  if (!player) { socket.emit('error', 'You are not in that room'); return; }

  // prevent multiple answers for same question
  if (player.lastAnsweredIndex === room.index) {
    socket.emit('error', 'Already answered this question');
    return;
  }

  const q = room.questions[room.index];
  if (!q) { socket.emit('error', 'No active question'); return; }

  const ans = q.answers.find(a => String(a.id) === String(answerId));
  if (!ans) { socket.emit('error', 'Answer option not found'); return; }

  if (ans.is_correct) player.score += 10;
  player.lastAnsweredIndex = room.index;

  // broadcast immediate score update
  io.to(code).emit("updateScores", room.players.map(p => ({ name: p.name, score: p.score })));

  // check if everyone answered this index -> auto-advance
  const allAnswered = room.players.length > 0 && room.players.every(p => p.lastAnsweredIndex === room.index);
  if (allAnswered) {
    // small delay so clients can show correct/wrong
    setTimeout(() => {
      room.index++;
      if (room.index >= room.questions.length) {
        io.to(code).emit("gameOver", room.players.map(p => ({ name: p.name, score: p.score })));
        rooms.delete(code);
        console.log('[room] gameOver for', code);
      } else {
        emitQuestion(code);
      }
    }, 1000);
  }
});

  // ... keep your disconnect handler
});


function emitQuestion(code) {
  const room = rooms.get(code);
  if (!room) return;
  const q = room.questions[room.index];
  io.to(code).emit("question", {
    index: room.index,
    total: room.questions.length,
    id: q.id,
    question: q.text,
    answers: q.answers.map(a => ({ id: a.id, text: a.text })),
    // do NOT include is_correct for multiplayer clients
  });
}


/* -------------------- start -------------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
