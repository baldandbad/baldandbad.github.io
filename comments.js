// comments.js
import express from "express";
import pkg from "pg";

const { Pool } = pkg;
const router = express.Router();

// Create DB connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// GET all comments
router.get("/", async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT * FROM comments ORDER BY created_at DESC"
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// POST new comment
router.post("/", async (req, res) => {
    try {
        const { name, message, avatar } = req.body;
        if (!name || !message) {
            return res.status(400).json({ error: "Name and message are required" });
        }

        const { rows } = await pool.query(
            "INSERT INTO comments (name, message, avatar) VALUES ($1, $2, $3) RETURNING *",
            [name, message, avatar || null]
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

export default router;
