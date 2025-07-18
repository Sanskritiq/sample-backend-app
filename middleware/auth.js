const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if session is valid
    const sessionQuery =
      "SELECT * FROM user_sessions WHERE session_token = $1 AND is_active = true AND expires_at > NOW()";
    const sessionResult = await pool.query(sessionQuery, [token]);

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(403).json({ error: "Invalid token" });
  }
};

module.exports = { authenticateToken, JWT_SECRET };
