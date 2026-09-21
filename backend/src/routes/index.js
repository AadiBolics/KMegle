const express = require("express");

const healthRouter = require("./health");
const turnRouter = require("./turn");
const adminRouter = require("./admin");

const router = express.Router();

router.use("/health", healthRouter);

router.use(
  "/turn-credentials",
  turnRouter
);

router.use(
  "/admin",
  adminRouter
);

module.exports = router;