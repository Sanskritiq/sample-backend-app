const { pool } = require("../config/database");

// Generate transaction reference
const generateTransactionRef = () => {
  return (
    "TXN" + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase()
  );
};

// Activity logging function
const logActivity = async (
  userId,
  action,
  tableName = null,
  recordId = null,
  oldValues = null,
  newValues = null,
  req = null
) => {
  try {
    const query = `
            INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
    await pool.query(query, [
      userId,
      action,
      tableName,
      recordId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      req ? req.ip : null,
      req ? req.get("User-Agent") : null,
    ]);
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

module.exports = { generateTransactionRef, logActivity };
