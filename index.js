import http from "http";
import express from "express";
import dotenv from "dotenv";
import { Server } from "socket.io";
import cors from "cors";

dotenv.config();

const corsOptions = {
  origin: "*", 
  credentials: true, 
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
let roomCodes = {};
const MAX_USERS_PER_ROOM = 2;
const CODE_LENGTH = 6;

function generateRoomCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

io.on("connection", (socket) => {
  console.log(`Someone connected to socket server and socket id is ${socket.id}`);

  io.emit("allusers", allusers);

  socket.on("create-room", (username, callback) => {
    if (Object.keys(allusers).includes(username)) {
      callback({ error: "Username already taken" });
      return;
    }
    
    const roomCode = generateRoomCode();
    roomCodes[roomCode] = {
      users: [username],
      creator: username,
      socketId: socket.id
    };
    
    allusers[username] = { username, id: socket.id, roomCode };
    callback({ roomCode });
    io.emit("allusers", allusers);
  });

  socket.on("join-room", (username, roomCode, callback) => {
    roomCode = roomCode.toUpperCase();
    
    if (!roomCodes[roomCode]) {
      callback({ error: "Invalid room code" });
      return;
    }
    
    if (roomCodes[roomCode].users.length >= MAX_USERS_PER_ROOM) {
      callback({ error: "Room is full" });
      return;
    }
    
    if (Object.keys(allusers).includes(username)) {
      callback({ error: "Username already taken" });
      return;
    }
    
    roomCodes[roomCode].users.push(username);
    allusers[username] = { username, id: socket.id, roomCode };
    
    callback({ success: true, otherUser: roomCodes[roomCode].users[0] });
    io.emit("allusers", allusers);
    
    io.to(roomCodes[roomCode].socketId).emit("user-joined", username);
  });

  socket.on("clearUsers", (e) => {
    allusers = {};
    io.emit("allusers", allusers);
    console.log(allusers);
  });

  socket.on("offer", ({ from, to, offer }) => {
    console.log({ from, to, offer });
    if (allusers[to] && allusers[from] && allusers[from].roomCode === allusers[to].roomCode) {
      io.to(allusers[to].id).emit("offer", { from, to, offer });
    }
  });

  socket.on("answer", ({ from, to, answer }) => {
    if (allusers[to] && allusers[from] && allusers[from].roomCode === allusers[to].roomCode) {
      io.to(allusers[from].id).emit("answer", { from, to, answer });
    }
  });

  socket.on("call-ended", (caller) => {
    const [from, to] = caller;
    if (allusers[from]) io.to(allusers[from].id).emit("call-ended", caller);
    if (allusers[to]) io.to(allusers[to].id).emit("call-ended", caller);

    if (allusers[from] && allusers[from].roomCode) {
      const roomCode = allusers[from].roomCode;
      delete roomCodes[roomCode];
    }
    
    allusers = {};
    io.emit("allusers", allusers);
  });

  socket.on("icecandidate", (candidate) => {
    console.log({ candidate });
    socket.broadcast.emit("icecandidate", candidate);
  });

  socket.on("message", (data) => {
    if (data && data.sender && data.content) {
      allmessages.push(data);
      console.log("Updated Messages:", allmessages);
      io.emit("allmessages", allmessages);
    }
  });

  socket.on("pv", (data) => {
    if(data=="true"){
      io.emit("pv", "true");
    }
  });

  socket.on("disconnect", () => {
    const user = Object.values(allusers).find(u => u.id === socket.id);
    if (user) {
      delete allusers[user.username];
      
      if (user.roomCode && roomCodes[user.roomCode]) {
        roomCodes[user.roomCode].users = roomCodes[user.roomCode].users.filter(u => u !== user.username);
        
        if (roomCodes[user.roomCode].users.length === 0) {
          delete roomCodes[user.roomCode];
        } else {
          // Notify remaining user that peer disconnected
          const remainingUser = roomCodes[user.roomCode].users[0];
          if (allusers[remainingUser]) {
            io.to(allusers[remainingUser].id).emit("peer-disconnected");
          }
        }
      }
    }
    
    io.emit("allusers", allusers);
    allmessages = [];
  });
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

server.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});