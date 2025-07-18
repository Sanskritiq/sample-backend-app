const express = require("express");
const router = express.Router();

// Get audit logs for user
router.get("/api/audit-logs", authenticateToken, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const query = `
            SELECT action, table_name, old_values, new_values, ip_address, created_at
            FROM audit_logs 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;
    const result = await pool.query(query, [req.user.userId, limit, offset]);

    // Get total count
    const countQuery =
      "SELECT COUNT(*) as total FROM audit_logs WHERE user_id = $1";
    const countResult = await pool.query(countQuery, [req.user.userId]);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      logs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Export the router
module.exports = router;
