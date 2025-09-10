// server.js
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
    origin: ["https://baldandbad.github.io", "http://localhost:5173", "http://localhost:3000"], // add local origins for testing if needed
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

/**
 * Helper: accept multiple payload shapes
 * - If payload is an object, try the keys in order and return first defined
 * - If payload is a primitive (string/number), return it directly
 */
function extractField(payload, ...keys) {
  if (payload === undefined || payload === null) return payload;
  if (typeof payload === "object") {
    for (const k of keys) {
      if (payload[k] !== undefined) return payload[k];
    }
    return undefined;
  }
  return payload;
}

// --- Socket handlers (replace your io.on connection block with this) ---
io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);

  function extractField(payload, ...keys) {
    if (payload === undefined || payload === null) return payload;
    if (typeof payload === "object") {
      for (const k of keys) if (payload[k] !== undefined) return payload[k];
      return undefined;
    }
    return payload;
  }

  // create room
  socket.on("createRoom", async (payload) => {
    try {
      const quizId = extractField(payload, "quizId", "qid") ?? payload;
      const code = Math.random().toString(36).slice(2, 6).toUpperCase();

      const qRes = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option
         FROM questions WHERE quiz_id=$1 ORDER BY id`,
        [quizId]
      );

      if (!qRes.rows.length) {
        socket.emit("error", "No questions found for this quiz");
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

      const room = {
        hostId: socket.id,
        players: [{ id: socket.id, name: "Host", score: 0, lastAnsweredIndex: -1 }],
        questions,
        index: -1,
        pendingAnswers: {},      // { [questionIndex]: [{ playerId, choice }] }
        questionTimeoutId: null,
        questionTimeLimit: 12    // default seconds
      };

      rooms.set(code, room);
      socket.join(code);
      socket.emit("roomCreated", { code });
      io.to(code).emit("playerList", room.players.map(p => ({ id: p.id, name: p.name, score: p.score })));
      console.log("[createRoom] created", code);
    } catch (err) {
      console.error("createRoom error:", err);
      socket.emit("error", "Failed to create room");
    }
  });

  // join
  socket.on("joinRoom", (payload) => {
    const code = extractField(payload, "code", "roomId") ?? payload;
    const name = extractField(payload, "name", "player") ?? "Player";
    const room = rooms.get(code);
    if (!room) {
      socket.emit("error", "Room not found: " + String(code));
      return;
    }
    room.players.push({ id: socket.id, name, score: 0, lastAnsweredIndex: -1 });
    socket.join(code);
    io.to(code).emit("playerList", room.players.map(p => ({ id: p.id, name: p.name, score: p.score })));
    socket.emit("roomJoined", { code });
    console.log("[joinRoom] ", socket.id, "->", code, name);
  });

  // leave
  socket.on("leaveRoom", (payload) => {
    const code = extractField(payload, "code", "roomId") ?? payload;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx !== -1) {
      room.players.splice(idx, 1);
      socket.leave(code);
      io.to(code).emit("playerList", room.players.map(p => ({ id: p.id, name: p.name, score: p.score })));
    }
    if (room.players.length === 0) {
      setTimeout(() => {
        const r = rooms.get(code);
        if (r && r.players.length === 0) rooms.delete(code);
      }, 30000);
    }
  });

  // start the game
  socket.on("startGame", (payload) => {
    const code = extractField(payload, "code", "roomId") ?? payload;
    const room = rooms.get(code);
    if (!room) { socket.emit("error", "Room not found: " + String(code)); return; }
    // optionally: only allow host (room.hostId) to start
    room.index = 0;
    // clear any existing answers and reset guards
    room.pendingAnswers = {};
    room.players.forEach(p => p.lastAnsweredIndex = -1);
    emitQuestion(code);
    console.log("[startGame] started", code);
  });

  // submit answer
  socket.on("submitAnswer", (payload) => {
    const code = extractField(payload, "code", "roomId") ?? payload;
    const answer = extractField(payload, "answerId", "answer");
    const room = rooms.get(code);
    if (!room) { socket.emit("error", "Room not found: " + String(code)); return; }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) { socket.emit("error", "You are not in that room"); return; }

    // guard: no active question
    if (room.index === null || room.index === undefined || room.index < 0) {
      socket.emit("error", "No active question"); return;
    }

    // prevent multiple answers for same question index
    if (player.lastAnsweredIndex === room.index) {
      socket.emit("error", "Already answered this question"); return;
    }

    // record answer
    room.pendingAnswers[room.index] = room.pendingAnswers[room.index] || [];
    room.pendingAnswers[room.index].push({ playerId: socket.id, choice: String(answer) });
    player.lastAnsweredIndex = room.index;

    // broadcast live scoreboard (scores not yet updated until endQuestion, but we can show who answered)
    io.to(code).emit("playerList", room.players.map(p => ({ id: p.id, name: p.name, score: p.score, answered: (p.lastAnsweredIndex === room.index) })));

    // if everyone answered, end question early
    const allAnswered = room.players.length > 0 && room.players.every(p => p.lastAnsweredIndex === room.index);
    if (allAnswered) {
      // clear timeout and end question now
      if (room.questionTimeoutId) {
        clearTimeout(room.questionTimeoutId);
        room.questionTimeoutId = null;
      }
      endQuestion(code);
    }
  });

  // disconnect
  socket.on("disconnect", () => {
    console.log("[socket] disconnect", socket.id);
    for (const [code, room] of rooms.entries()) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit("playerList", room.players.map(p => ({ id: p.id, name: p.name, score: p.score })));
        if (room.players.length === 0) {
          setTimeout(() => {
            const r = rooms.get(code);
            if (r && r.players.length === 0) rooms.delete(code);
          }, 30000);
        }
      }
    }
  });

  // ---------- helper to end current question ----------
  function endQuestion(code) {
    const room = rooms.get(code);
    if (!room) return;
    const qIndex = room.index;
    const q = room.questions[qIndex];
    if (!q) return;

    // prepare results array (for each player)
    const results = room.players.map(p => {
      const pa = (room.pendingAnswers[qIndex] || []).find(a => a.playerId === p.id);
      const choice = pa ? pa.choice : null;
      const answerObj = q.answers.find(a => String(a.id) === String(choice));
      const correct = answerObj ? !!answerObj.is_correct : false;
      const points = correct ? 10 : 0;
      if (correct) p.score += points;
      return { playerId: p.id, name: p.name, choice, correct, points };
    });

    // emit question-ended with results and updated scores
    io.to(code).emit("question-ended", {
      questionIndex: qIndex,
      questionId: q.id,
      correctAnswerId: q.answers.find(a => a.is_correct)?.id ?? null,
      results,
      scores: room.players.map(p => ({ id: p.id, name: p.name, total: p.score }))
    });

    // short pause then advance or end game
    setTimeout(() => {
      room.index++;
      // clear pending answers for this question (optional)
      delete room.pendingAnswers[qIndex];
      room.players.forEach(p => p.lastAnsweredIndex = -1);
      if (room.index >= room.questions.length) {
        io.to(code).emit("gameOver", { scores: room.players.map(p => ({ id: p.id, name: p.name, total: p.score })) });
        // keep room alive for 30s for clients, then delete
        setTimeout(() => rooms.delete(code), 30000);
      } else {
        emitQuestion(code);
      }
    }, 1500);
  }

  // helper: emit question and start per-question timeout
  function emitQuestion(code) {
    const room = rooms.get(code);
    if (!room) return;
    const q = room.questions[room.index];
    if (!q) return;
    // include a timeLimit for clients (seconds)
    const timeLimit = room.questionTimeLimit ?? 12;
    // clear any prior timeout
    if (room.questionTimeoutId) { clearTimeout(room.questionTimeoutId); room.questionTimeoutId = null; }
    // emit question
    io.to(code).emit("question", {
      index: room.index,
      total: room.questions.length,
      id: q.id,
      text: q.text,
      answers: q.answers.map(a => ({ id: a.id, text: a.text })),
      timeLimit
    });
    // set timer to auto-end the question
    room.questionTimeoutId = setTimeout(() => {
      room.questionTimeoutId = null;
      endQuestion(code);
    }, timeLimit * 1000);
  }

});


/* -------------------- start -------------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
