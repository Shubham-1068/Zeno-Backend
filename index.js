import http from "http";
import express from "express";
import dotenv from "dotenv";
import { Server } from "socket.io";
import cors from "cors";

dotenv.config();

const corsOptions = {
  origin: "*", // Allow requests from any origin
  credentials: true, // Allow credentials like cookies, authorization headers
};

const PORT = process.env.PORT || 5000;

const app = express();

app.use(cors(corsOptions));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

let allusers = {};
let allmessages = [];
let MAX_USERS = 2;

// handle socket connections
io.on("connection", (socket) => {
  console.log(
    `Someone connected to socket server and socket id is ${socket.id}`
  );

  io.emit("allusers", allusers);
  // io.emit("allmessages", allmessages);

  socket.on("join-user", (username) => {
    console.log(`${username} is attempting to join the socket connection.`);

    if (Object.keys(allusers).length >= 2) {
      console.log(`User limit reached. Disconnecting ${username}.`);
      // Notify the user and disconnect them
      socket.emit(
        "user-limit-reached",
        "User limit has been reached. You have been disconnected."
      );
      socket.disconnect(); // Disconnect the user from the socket
      return;
    }

    allusers[username] = { username, id: socket.id };
    console.log(`${username} successfully joined.`);

    // Inform everyone that someone joined
    io.emit("joined", allusers);
  });

  socket.on("clearUsers", (e) => {
    allusers = {};

    io.emit("allusers", allusers);
    console.log(allusers);
  });

  socket.on("offer", ({ from, to, offer }) => {
    console.log({ from, to, offer });
    io.to(allusers[to].id).emit("offer", { from, to, offer });
  });

  socket.on("answer", ({ from, to, answer }) => {
    io.to(allusers[from].id).emit("answer", { from, to, answer });
  });

  socket.on("end-call", ({ from, to }) => {
    io.to(allusers[to].id).emit("end-call", { from, to });
  });

  socket.on("call-ended", (caller) => {
    const [from, to] = caller;
    io.to(allusers[from].id).emit("call-ended", caller);
    io.to(allusers[to].id).emit("call-ended", caller);

    // Remove user from object
    allusers = {};

    console.log(allusers); // Log the updated allusers object

    io.emit("allusers", allusers);
  });

  socket.on("icecandidate", (candidate) => {
    console.log({ candidate });
    //broadcast to other peers
    socket.broadcast.emit("icecandidate", candidate);
  });

  // Send the current messages to the newly connected client
  socket.emit("allmessages", allmessages);

  // Handle incoming messages
  socket.on("message", (data) => {
    if (data && data.sender && data.content) {
      allmessages.push(data); // Add the new message to the array
      console.log("Updated Messages:", allmessages);

      // Broadcast the updated array to all clients
      io.emit("allmessages", allmessages);
    }
  });

  socket.on("pv", (data) => {
    if(data=="true"){
      io.emit("pv", "true");
    }
  });

  socket.on("disconnect", () => {
    allmessages = [];
  });
}); 

app.get("/", (req, res) => {
  res.send("Hello World!");
});

server.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
