const express = require("express");

const healthRouter = require("./health");
const turnRouter = require("./turn");
const adminRouter = require("./admin");
const blocksRouter = require("./blocks");

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

router.use(
  "/blocks",
  blocksRouter
);

module.exports = router;