const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();

const { pool } = require("../config/database");
const { authenticateToken, JWT_SECRET } = require("../middleware/auth");
const { logActivity } = require("../utils/helpers");

// User Login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  try {
    // Get user from database
    const userQuery =
      "SELECT * FROM users WHERE username = $1 AND is_active = true";
    const userResult = await pool.query(userQuery, [username]);

    if (userResult.rows.length === 0) {
      await logActivity(
        null,
        "LOGIN_FAILED",
        "users",
        null,
        null,
        { username },
        req
      );
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = userResult.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      await logActivity(
        user.id,
        "LOGIN_FAILED",
        "users",
        user.id,
        null,
        { username },
        req
      );
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Store session
    const sessionQuery = `
            INSERT INTO user_sessions (user_id, session_token, expires_at)
            VALUES ($1, $2, NOW() + INTERVAL '24 hours')
        `;
    await pool.query(sessionQuery, [user.id, token]);

    // Log successful login
    await logActivity(
      user.id,
      "LOGIN_SUCCESS",
      "users",
      user.id,
      null,
      { username },
      req
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// User Logout
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    const token = req.headers["authorization"].split(" ")[1];

    // Deactivate session
    const sessionQuery =
      "UPDATE user_sessions SET is_active = false WHERE session_token = $1";
    await pool.query(sessionQuery, [token]);

    await logActivity(
      req.user.userId,
      "LOGOUT",
      "user_sessions",
      null,
      null,
      null,
      req
    );

    res.json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
