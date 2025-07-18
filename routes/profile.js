const express = require("express");
const router = express.Router();

// Get user profile
router.get("/api/profile", authenticateToken, async (req, res) => {
  try {
    const query = `
            SELECT id, username, full_name, email, created_at, updated_at
            FROM users 
            WHERE id = $1 AND is_active = true
        `;
    const result = await pool.query(query, [req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user profile
router.put("/api/profile", authenticateToken, async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    return res.status(400).json({ error: "Full name and email are required" });
  }

  try {
    // Get current user data
    const currentQuery = "SELECT full_name, email FROM users WHERE id = $1";
    const currentResult = await pool.query(currentQuery, [req.user.userId]);
    const oldValues = currentResult.rows[0];

    // Update user profile
    const updateQuery = `
            UPDATE users 
            SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING id, username, full_name, email, updated_at
        `;
    const result = await pool.query(updateQuery, [
      fullName,
      email,
      req.user.userId,
    ]);

    await logActivity(
      req.user.userId,
      "PROFILE_UPDATED",
      "users",
      req.user.userId,
      oldValues,
      result.rows[0],
      req
    );

    res.json({
      message: "Profile updated successfully",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Change password
router.put("/api/change-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Current password and new password are required" });
  }

  if (newPassword.length < 8) {
    return res
      .status(400)
      .json({ error: "New password must be at least 8 characters long" });
  }

  try {
    // Verify current password
    const userQuery = "SELECT password_hash FROM users WHERE id = $1";
    const userResult = await pool.query(userQuery, [req.user.userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const isValidPassword = await bcrypt.compare(
      currentPassword,
      userResult.rows[0].password_hash
    );
    if (!isValidPassword) {
      await logActivity(
        req.user.userId,
        "PASSWORD_CHANGE_FAILED",
        "users",
        req.user.userId,
        null,
        null,
        req
      );
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const updateQuery = `
            UPDATE users 
            SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `;
    await pool.query(updateQuery, [hashedNewPassword, req.user.userId]);

    // Invalidate all existing sessions
    const invalidateSessionsQuery =
      "UPDATE user_sessions SET is_active = false WHERE user_id = $1";
    await pool.query(invalidateSessionsQuery, [req.user.userId]);

    await logActivity(
      req.user.userId,
      "PASSWORD_CHANGED",
      "users",
      req.user.userId,
      null,
      null,
      req
    );

    res.json({ message: "Password changed successfully. Please login again." });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Export the router
module.exports = router;