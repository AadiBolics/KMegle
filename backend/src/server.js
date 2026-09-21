require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");

const createSocketServer = require("./config/socket");
const routes = require("./routes");
const registerSockets = require("./sockets");

const app = express();


// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(cors());

app.use(express.json());


// --------------------------------------------------
// HTTP Server
// --------------------------------------------------

const server = http.createServer(app);


// --------------------------------------------------
// Socket.IO
// --------------------------------------------------

const io = createSocketServer(server);

registerSockets(io);


// --------------------------------------------------
// HTTP Routes
// --------------------------------------------------

app.use("/api", routes);


// --------------------------------------------------
// Server
// --------------------------------------------------

const PORT = process.env.PORT || 5000;

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🚀 Signaling Server is running on port ${PORT}`
    );
  }
);