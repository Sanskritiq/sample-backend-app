const express = require("express");
const router = express.Router();

// Verify transaction password
router.post(
  "/api/verify-transaction-password",
  authenticateToken,
  async (req, res) => {
    const { transactionPassword } = req.body;

    if (!transactionPassword) {
      return res
        .status(400)
        .json({ error: "Transaction password is required" });
    }

    try {
      const userQuery =
        "SELECT transaction_password_hash FROM users WHERE id = $1";
      const userResult = await pool.query(userQuery, [req.user.userId]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValidPassword = await bcrypt.compare(
        transactionPassword,
        userResult.rows[0].transaction_password_hash
      );

      if (!isValidPassword) {
        await logActivity(
          req.user.userId,
          "TRANSACTION_PASSWORD_FAILED",
          "users",
          req.user.userId,
          null,
          null,
          req
        );
        return res.status(401).json({ error: "Invalid transaction password" });
      }

      res.json({ message: "Transaction password verified successfully" });
    } catch (error) {
      console.error("Verify transaction password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Send Money
router.post("/api/transactions/send", authenticateToken, async (req, res) => {
  const {
    fromAccountId,
    toAccountNumber,
    toSortCode,
    toAccountName,
    amount,
    description,
    transactionPassword,
  } = req.body;

  if (
    !fromAccountId ||
    !toAccountNumber ||
    !toSortCode ||
    !toAccountName ||
    !amount ||
    !transactionPassword
  ) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (amount <= 0) {
    return res.status(400).json({ error: "Amount must be greater than 0" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verify transaction password
    const userQuery =
      "SELECT transaction_password_hash FROM users WHERE id = $1";
    const userResult = await client.query(userQuery, [req.user.userId]);

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    const isValidPassword = await bcrypt.compare(
      transactionPassword,
      userResult.rows[0].transaction_password_hash
    );

    if (!isValidPassword) {
      await client.query("ROLLBACK");
      await logActivity(
        req.user.userId,
        "TRANSACTION_PASSWORD_FAILED",
        "users",
        req.user.userId,
        null,
        null,
        req
      );
      return res.status(401).json({ error: "Invalid transaction password" });
    }

    // Check if account belongs to user and has sufficient balance
    const accountQuery = `
            SELECT id, account_number, account_name, balance, sort_code
            FROM accounts 
            WHERE id = $1 AND user_id = $2 AND is_active = true
        `;
    const accountResult = await client.query(accountQuery, [
      fromAccountId,
      req.user.userId,
    ]);

    if (accountResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Account not found" });
    }

    const account = accountResult.rows[0];
    const numericAmount = parseFloat(amount);

    if (account.balance < numericAmount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Check if sending to same account
    if (
      account.account_number === toAccountNumber &&
      account.sort_code === toSortCode
    ) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Cannot send money to the same account" });
    }

    // Generate transaction reference
    const transactionRef = generateTransactionRef();

    // Create transaction record
    const transactionQuery = `
            INSERT INTO transactions (
                transaction_ref, from_account_id, to_account_number, to_sort_code, 
                to_account_name, amount, description, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
            RETURNING id, transaction_ref, created_at
        `;
    const transactionResult = await client.query(transactionQuery, [
      transactionRef,
      fromAccountId,
      toAccountNumber,
      toSortCode,
      toAccountName,
      numericAmount,
      description,
    ]);

    const transaction = transactionResult.rows[0];

    // Update account balance
    const updateBalanceQuery = `
            UPDATE accounts 
            SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `;
    await client.query(updateBalanceQuery, [numericAmount, fromAccountId]);

    // Add transaction status history
    const statusHistoryQuery = `
            INSERT INTO transaction_status_history (transaction_id, status, created_by)
            VALUES ($1, 'pending', $2)
        `;
    await client.query(statusHistoryQuery, [transaction.id, req.user.userId]);

    // Simulate transaction processing (in real world, this would be async)
    setTimeout(async () => {
      try {
        const processClient = await pool.connect();
        await processClient.query("BEGIN");

        // Update transaction status to completed
        const updateStatusQuery = `
                    UPDATE transactions 
                    SET status = 'completed', processed_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `;
        await processClient.query(updateStatusQuery, [transaction.id]);

        // Add status history
        const statusHistoryQuery = `
                    INSERT INTO transaction_status_history (transaction_id, status, reason)
                    VALUES ($1, 'completed', 'Transaction processed successfully')
                `;
        await processClient.query(statusHistoryQuery, [transaction.id]);

        await processClient.query("COMMIT");
        processClient.release();
      } catch (error) {
        console.error("Transaction processing error:", error);
      }
    }, 5000); // Process after 5 seconds

    await client.query("COMMIT");

    await logActivity(
      req.user.userId,
      "TRANSACTION_INITIATED",
      "transactions",
      transaction.id,
      null,
      {
        transactionRef,
        amount: numericAmount,
        toAccountNumber,
        toSortCode,
      },
      req
    );

    res.status(201).json({
      message: "Transaction initiated successfully",
      transaction: {
        id: transaction.id,
        transactionRef: transaction.transaction_ref,
        amount: numericAmount,
        toAccountName,
        status: "pending",
        createdAt: transaction.created_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Send money error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Get transaction history
router.get("/api/transactions", authenticateToken, async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
            SELECT t.*, a.account_number as from_account_number, a.account_name as from_account_name
            FROM transactions t
            JOIN accounts a ON t.from_account_id = a.id
            WHERE a.user_id = $1
        `;
    const params = [req.user.userId];

    if (status) {
      query += ` AND t.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `
            SELECT COUNT(*) as total
            FROM transactions t
            JOIN accounts a ON t.from_account_id = a.id
            WHERE a.user_id = $1
        `;
    const countParams = [req.user.userId];

    if (status) {
      countQuery += ` AND t.status = $2`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get transaction details
router.get("/api/transactions/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
            SELECT t.*, a.account_number as from_account_number, a.account_name as from_account_name,
                   a.sort_code as from_sort_code
            FROM transactions t
            JOIN accounts a ON t.from_account_id = a.id
            WHERE t.id = $1 AND a.user_id = $2
        `;
    const result = await pool.query(query, [id, req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Get status history
    const statusHistoryQuery = `
            SELECT status, reason, created_at
            FROM transaction_status_history
            WHERE transaction_id = $1
            ORDER BY created_at ASC
        `;
    const statusHistoryResult = await pool.query(statusHistoryQuery, [id]);

    const transaction = result.rows[0];
    res.json({
      ...transaction,
      statusHistory: statusHistoryResult.rows,
    });
  } catch (error) {
    console.error("Get transaction details error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Export the router
module.exports = router;
