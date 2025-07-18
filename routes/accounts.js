const express = require("express");
const router = express.Router();

router.get("/api/accounts", authenticateToken, async (req, res) => {
  try {
    const query = `
            SELECT id, account_number, account_name, sort_code, balance, account_type
            FROM accounts 
            WHERE user_id = $1 AND is_active = true
            ORDER BY account_name
        `;
    const result = await pool.query(query, [req.user.userId]);
    res.json(result.rows);
  } catch (error) {
    console.error("Get accounts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get account details
router.get("/api/accounts/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
            SELECT id, account_number, account_name, sort_code, balance, account_type, created_at
            FROM accounts 
            WHERE id = $1 AND user_id = $2 AND is_active = true
        `;
    const result = await pool.query(query, [id, req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Get account details error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// export the router
module.exports = router;
