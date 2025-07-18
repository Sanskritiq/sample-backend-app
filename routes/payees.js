const express = require("express");
const router = express.Router();

// Get user's payees
router.get("/api/payees", authenticateToken, async (req, res) => {
  try {
    const query = `
            SELECT id, payee_name, account_number, sort_code, bank_name, nickname, created_at
            FROM payees 
            WHERE user_id = $1 AND is_active = true
            ORDER BY payee_name
        `;
    const result = await pool.query(query, [req.user.userId]);
    res.json(result.rows);
  } catch (error) {
    console.error("Get payees error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/api/payees", authenticateToken, async (req, res) => {
  const { payeeName, accountNumber, sortCode, bankName, nickname } = req.body;

  if (!payeeName || !accountNumber || !sortCode) {
    return res
      .status(400)
      .json({
        error: "Payee name, account number, and sort code are required",
      });
  }

  try {
    // Check if payee already exists
    const existingQuery = `
            SELECT id FROM payees 
            WHERE user_id = $1 AND account_number = $2 AND sort_code = $3 AND is_active = true
        `;
    const existingResult = await pool.query(existingQuery, [
      req.user.userId,
      accountNumber,
      sortCode,
    ]);

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: "Payee already exists" });
    }

    // Insert new payee
    const insertQuery = `
            INSERT INTO payees (user_id, payee_name, account_number, sort_code, bank_name, nickname)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, payee_name, account_number, sort_code, bank_name, nickname, created_at
        `;
    const result = await pool.query(insertQuery, [
      req.user.userId,
      payeeName,
      accountNumber,
      sortCode,
      bankName,
      nickname,
    ]);

    await logActivity(
      req.user.userId,
      "PAYEE_ADDED",
      "payees",
      result.rows[0].id,
      null,
      result.rows[0],
      req
    );

    res.status(201).json({
      message: "Payee added successfully",
      payee: result.rows[0],
    });
  } catch (error) {
    console.error("Add payee error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete payee
router.delete("/api/payees/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Check if payee exists and belongs to user
    const checkQuery =
      "SELECT * FROM payees WHERE id = $1 AND user_id = $2 AND is_active = true";
    const checkResult = await pool.query(checkQuery, [id, req.user.userId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Payee not found" });
    }

    // Soft delete the payee
    const deleteQuery =
      "UPDATE payees SET is_active = false WHERE id = $1 AND user_id = $2";
    await pool.query(deleteQuery, [id, req.user.userId]);

    await logActivity(
      req.user.userId,
      "PAYEE_DELETED",
      "payees",
      id,
      checkResult.rows[0],
      null,
      req
    );

    res.json({ message: "Payee deleted successfully" });
  } catch (error) {
    console.error("Delete payee error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// export the router
module.exports = router;
