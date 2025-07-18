const express = require("express");
const router = express.Router();

/* GET home page. */
router.get("/", function (req, res, next) {
  res.json({
    message: "Banking API Server",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      dashboard: "/api/dashboard",
      accounts: "/api/accounts",
      transactions: "/api/transactions",
      payees: "/api/payees",
      profile: "/api/profile",
    },
  });
});

module.exports = router;
