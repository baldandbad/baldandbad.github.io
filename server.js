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
    // adjust origins for your frontend deployment(s)
    origin: ["https://baldandbad.github.io", "http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

/* ---------------- REST endpoints (unchanged) ---------------- */

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY;

app.post("/ask", async (req, res) => {
  console.log("----- /ask called -----");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  const userMsg = req.body?.message;
  if (!userMsg || typeof userMsg !== "string" || userMsg.trim() === "") {
    console.warn("Empty or missing 'message' in request body");
    return res.status(400).json({ reply: "", error: "Missing 'message' in request body" });
  }

  const payload = {
    model: "deepseek/deepseek-r1-0528:free",
    messages: [
      { role: "system", content: "Bạn là một Trợ lý AI giúp học sinh về các di tích lịch sử trong TPHCM" },
      { role: "user", content: userMsg }
    ]
  };

  try {
    if (!API_KEY) console.warn("OPENROUTER_API_KEY is not set");

    const openRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await openRes.text(); // read raw text first (safe for debugging)
    console.log("OpenRouter raw response (text):", raw);

    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (parseErr) {
      console.error("Failed to parse OpenRouter response as JSON:", parseErr);
      // Return the raw body for debugging
      return res.status(502).json({ reply: "", error: "Invalid JSON from OpenRouter", raw });
    }

    // If HTTP status not ok, return error info
    if (!openRes.ok) {
      console.error("OpenRouter returned non-OK status:", openRes.status, data);
      return res.status(openRes.status).json({ reply: "", error: data?.error || "OpenRouter error", raw: data });
    }

    console.log("OpenRouter parsed JSON:", JSON.stringify(data, null, 2));

    // Robust extraction function - try several possible fields
    function extractReply(d) {
      // 1) Standard chat format (OpenAI-like / OpenRouter docs)
      const c0 = d?.choices?.[0];
      if (c0) {
        if (typeof c0?.message?.content === "string" && c0.message.content.trim() !== "") return c0.message.content;
        // some providers/models use 'text' or 'content' directly
        if (typeof c0?.text === "string" && c0.text.trim() !== "") return c0.text;
        // if streaming tokens were used, text may be under delta (not expected here)
        if (typeof c0?.delta?.content === "string" && c0.delta.content.trim() !== "") return c0.delta.content;
      }
      // 2) Other shapes (some providers put content in output/result)
      if (Array.isArray(d?.output) && d.output[0]?.content?.[0]?.text) return d.output[0].content[0].text;
      if (typeof d?.result?.content === "string" && d.result.content.trim() !== "") return d.result.content;
      // 3) fallback: if there's a top-level 'reply' (your current code assumed this), return that
      if (typeof d?.reply === "string" && d.reply.trim() !== "") return d.reply;
      return null;
    }

    const reply = extractReply(data);

    if (!reply) {
      console.warn("No usable text found in OpenRouter response. Returning debug info.");
      // In development only: return the whole parsed response so you can inspect it client-side.
      // IMPORTANT: remove or change this before production to avoid revealing secrets.
      return res.json({ reply: "No reply.", debug: data });
    }

    // normal success case
    return res.json({ reply });

  } catch (err) {
    console.error("Error while calling OpenRouter:", err);
    return res.status(500).json({ error: "Error talking to OpenRouter", details: err?.message });
  }
});


app.use("/comments", commentsRouter);

app.get("/", (_req, res) => {
  res.send("Backend is running ✅");
});

app.get("/api/quizzes", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, title FROM quizzes ORDER BY id");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

/* ---------------- Socket.IO multiplayer ---------------- */

const rooms = new Map();

/**
 * Accept multiple payload shapes:
 * - If payload is object, return first defined key in keys
 * - If payload is primitive, return it
 */
function extractField(payload, ...keys) {
  if (payload === undefined || payload === null) return payload;
  if (typeof payload === "object") {
    for (const k of keys) {
      if (payload[k] !== undefined) return payload[k];
    }
    return undefined;
  }
  return payload; // primitive (string/number)
}

/**
 * Score calculation:
 * - correct: basePoints + Math.floor(remainingSeconds)
 * - basePoints = 10
 */
function calcPoints(isCorrect, remainingSeconds) {
  if (!isCorrect) return 0;
  const base = 10;
  const bonus = Math.max(0, Math.floor(remainingSeconds)); // simple bonus
  return base + bonus;
}

io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);

  // Create room
  socket.on("createRoom", async (payload) => {
    try {
      const quizId = extractField(payload, "quizId", "qid") ?? payload;
      console.log("[createRoom] from", socket.id, "quizId=", quizId);

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

      const code = Math.random().toString(36).slice(2, 6).toUpperCase();
      const room = {
        hostId: socket.id,
        players: [{ id: socket.id, name: "Host", score: 0, lastAnsweredIndex: -1 }],
        questions,
        index: -1,
        pendingAnswers: {},     // { [questionIndex]: [{ playerId, choice, timeSecRemaining }] }
        questionTimeoutId: null,
        questionTimeLimit: 12,
        questionStartTs: null
      };

      rooms.set(code, room);
      socket.join(code);

      socket.emit("roomCreated", { code });
      io.to(code).emit("playerList", room.players.map(p => ({ id: p.id, name: p.name, score: p.score })));
      console.log("[createRoom] created", code, "host=", socket.id);
    } catch (err) {
      console.error("createRoom error:", err);
      socket.emit("error", "Failed to create room");
    }
  });

  // Join room
  socket.on("joinRoom", (payload) => {
    const code = extractField(payload, "code", "roomId") ?? payload;
    const name = extractField(payload, "name", "player") ?? "Player";
    console.log("[joinRoom]", socket.id, "->", code, name);

    const room = rooms.get(code);
    if (!room) {
      socket.emit("error", "Room not found: " + String(code));
      return;
    }

    // avoid duplicate same-socket
    if (room.players.some(p => p.id === socket.id)) {
      socket.emit("roomJoined", { code });
      socket.join(code);
      return;
    }

    room.players.push({ id: socket.id, name, score: 0, lastAnsweredIndex: -1 });
    socket.join(code);

    io.to(code).emit("playerList", room.players.map(p => ({ id: p.id, name: p.name, score: p.score })));
    socket.emit("roomJoined", { code });
    console.log("[joinRoom] success", socket.id, "in", code);
  });

  // Leave room
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
      console.log("[leaveRoom] removed", socket.id, "from", code);
    }

    if (room.players.length === 0) {
      // delete empty room after short grace
      setTimeout(() => {
        const r = rooms.get(code);
        if (r && r.players.length === 0) {
          rooms.delete(code);
          console.log("[room] deleted empty", code);
        }
      }, 30000);
    }
  });

  // Start game (host can start)
  socket.on("startGame", (payload) => {
    const code = extractField(payload, "code", "roomId") ?? payload;
    const room = rooms.get(code);
    if (!room) {
      socket.emit("error", "Room not found: " + String(code));
      return;
    }

    // optional: enforce host only
    if (room.hostId && room.hostId !== socket.id) {
      // if you want to enforce, uncomment next lines:
      // socket.emit("error", "Only host can start the game");
      // return;
    }

    room.index = 0;
    room.pendingAnswers = {};
    room.players.forEach(p => p.lastAnsweredIndex = -1);
    emitQuestion(code);
    console.log("[startGame] started", code);
  });

  // Submit answer
  socket.on("submitAnswer", (payload) => {
    const code = extractField(payload, "code", "roomId") ?? payload;
    const answer = extractField(payload, "answerId", "answer");
    if (!code) {
      socket.emit("error", "Missing room code");
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      socket.emit("error", "Room not found: " + String(code));
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      socket.emit("error", "You are not in that room");
      return;
    }

    // Ensure active question
    if (typeof room.index !== "number" || room.index < 0 || room.index >= room.questions.length) {
      socket.emit("error", "No active question");
      return;
    }

    // Prevent multiple answers for same question
    if (player.lastAnsweredIndex === room.index) {
      socket.emit("error", "Already answered this question");
      return;
    }

    // record answer with remaining time:
    const nowTs = Date.now();
    const elapsedSec = room.questionStartTs ? Math.floor((nowTs - room.questionStartTs) / 1000) : 0;
    const remaining = Math.max(0, (room.questionTimeLimit || 12) - elapsedSec);

    room.pendingAnswers[room.index] = room.pendingAnswers[room.index] || [];
    room.pendingAnswers[room.index].push({ playerId: socket.id, choice: String(answer), remainingSec: remaining });

    // mark player as answered (guard)
    player.lastAnsweredIndex = room.index;

    // notify lobby who answered (useful UI)
    io.to(code).emit("playerList", room.players.map(p => ({ id: p.id, name: p.name, score: p.score, answered: (p.lastAnsweredIndex === room.index) })));

    // If everyone answered early -> end question now
    const allAnswered = room.players.length > 0 && room.players.every(p => p.lastAnsweredIndex === room.index);
    if (allAnswered) {
      if (room.questionTimeoutId) {
        clearTimeout(room.questionTimeoutId);
        room.questionTimeoutId = null;
      }
      // small delay to allow clients to show 'locked in' UI; then process
      setTimeout(() => {
        endQuestion(code);
      }, 700);
    }
  });

  // Disconnect cleanup
  socket.on("disconnect", () => {
    console.log("[socket] disconnect", socket.id);
    for (const [code, room] of rooms.entries()) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit("playerList", room.players.map(p => ({ id: p.id, name: p.name, score: p.score })));
        console.log("[disconnect] removed", socket.id, "from", code);
        if (room.players.length === 0) {
          setTimeout(() => {
            const r = rooms.get(code);
            if (r && r.players.length === 0) {
              rooms.delete(code);
              console.log("[room] deleted empty", code);
            }
          }, 30000);
        }
      }
    }
  });

  /* ---------------- helper functions inside connection for safety ---------------- */

  // End the current question: compute results, award points, emit question-ended, then advance or finish
  function endQuestion(code) {
    const room = rooms.get(code);
    if (!room) return;
    const qIndex = room.index;
    const q = room.questions[qIndex];
    if (!q) return;

    // collect results per-player
    const pending = room.pendingAnswers[qIndex] || [];
    const results = room.players.map(p => {
      const pa = pending.find(x => x.playerId === p.id);
      const chosen = pa ? pa.choice : null;
      const remainingSec = pa ? pa.remainingSec : 0;
      const answerObj = q.answers.find(a => String(a.id) === String(chosen));
      const correct = !!(answerObj && answerObj.is_correct);
      const points = calcPoints(correct, remainingSec);
      if (correct) p.score += points;
      // return result record
      return { playerId: p.id, name: p.name, choice: chosen, correct, points };
    });

    // emit question-ended (authoritative)
    io.to(code).emit("question-ended", {
      questionIndex: qIndex,
      questionId: q.id,
      correctAnswerId: q.answers.find(a => a.is_correct)?.id ?? null,
      results,
      scores: room.players.map(p => ({ id: p.id, name: p.name, total: p.score }))
    });

    // also emit an immediate score update for any UI that listens to updateScores
    io.to(code).emit("updateScores", room.players.map(p => ({ id: p.id, name: p.name, score: p.score })));

    // cleanup pending answers for this question (optional)
    delete room.pendingAnswers[qIndex];

    // prepare to advance after a short pause
    setTimeout(() => {
      room.index++;
      room.players.forEach(p => p.lastAnsweredIndex = -1);
      if (room.index >= room.questions.length) {
        // game over
        const finalScores = room.players.map(p => ({ id: p.id, name: p.name, total: p.score }));
        io.to(code).emit("gameOver", { scores: finalScores });
        // keep the room alive for a short time for clients to show results, then delete
        setTimeout(() => {
          const r = rooms.get(code);
          if (r) rooms.delete(code);
          console.log("[room] finished and deleted", code);
        }, 20000);
      } else {
        // emit next question
        emitQuestion(code);
      }
    }, 1200);
  }

  // Emit a question and start a per-question timeout so game can't hang
  function emitQuestion(code) {
    const room = rooms.get(code);
    if (!room) return;
    const q = room.questions[room.index];
    if (!q) return;

    // clear any previous timeout
    if (room.questionTimeoutId) {
      clearTimeout(room.questionTimeoutId);
      room.questionTimeoutId = null;
    }

    // set start timestamp
    room.questionStartTs = Date.now();
    const timeLimit = room.questionTimeLimit || 12;

    // emit the question (do NOT include is_correct)
    io.to(code).emit("question", {
      index: room.index,
      total: room.questions.length,
      id: q.id,
      text: q.text,
      answers: q.answers.map(a => ({ id: a.id, text: a.text })),
      timeLimit
    });

    // schedule auto-end when timer expires
    room.questionTimeoutId = setTimeout(() => {
      room.questionTimeoutId = null;
      endQuestion(code);
    }, timeLimit * 1000);
  }

});

/* -------------------- start server -------------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
