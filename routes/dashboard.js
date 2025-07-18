const express = require("express");
const router = express.Router();

// User Dashboard
router.get("/api/dashboard", authenticateToken, async (req, res) => {
  try {
    // Get user account summary
    const accountQuery = `
            SELECT a.*, u.full_name 
            FROM accounts a
            JOIN users u ON a.user_id = u.id
            WHERE a.user_id = $1 AND a.is_active = true
        `;
    const accountResult = await pool.query(accountQuery, [req.user.userId]);

    // Get recent transactions
    const transactionsQuery = `
            SELECT t.*, 
                   CASE 
                       WHEN t.from_account_id = a.id THEN 'debit'
                       ELSE 'credit'
                   END as transaction_direction
            FROM transactions t
            LEFT JOIN accounts a ON t.from_account_id = a.id AND a.user_id = $1
            WHERE t.from_account_id IN (SELECT id FROM accounts WHERE user_id = $1)
               OR (t.to_account_number IN (SELECT account_number FROM accounts WHERE user_id = $1) 
                   AND t.to_sort_code IN (SELECT sort_code FROM accounts WHERE user_id = $1))
            ORDER BY t.created_at DESC
            LIMIT 10
        `;
    const transactionsResult = await pool.query(transactionsQuery, [
      req.user.userId,
    ]);

    // Get payees count
    const payeesQuery =
      "SELECT COUNT(*) as count FROM payees WHERE user_id = $1 AND is_active = true";
    const payeesResult = await pool.query(payeesQuery, [req.user.userId]);

    res.json({
      user: {
        id: req.user.userId,
        username: req.user.username,
        fullName: accountResult.rows[0]?.full_name || "",
      },
      accounts: accountResult.rows,
      recentTransactions: transactionsResult.rows,
      payeesCount: parseInt(payeesResult.rows[0].count),
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Export the router
module.exports = router;
