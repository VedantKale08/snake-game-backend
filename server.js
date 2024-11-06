const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", 
    methods: ["GET", "POST"],
  },
});

const GRID_WIDTH = 400;
const GRID_HEIGHT = 200;
const SEGMENT_SIZE = 10;
const MOVEMENT_SPEED = 150;
let players = {};
let food = generateRandomFood();
let gameInterval = null;

function generateRandomFood() {
  let newFood;
  let isFoodOnSnake;

  do {
    newFood = {
      x: Math.floor(Math.random() * (GRID_WIDTH / SEGMENT_SIZE)) * SEGMENT_SIZE,
      y:
        Math.floor(Math.random() * (GRID_HEIGHT / SEGMENT_SIZE)) * SEGMENT_SIZE,
    };

    isFoodOnSnake = Object.values(players).some((player) =>
      player.segments.some(
        (segment) => segment.x === newFood.x && segment.y === newFood.y
      )
    );
  } while (isFoodOnSnake); 
  return newFood;
}

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  players[socket.id] = {
    id: socket.id,
    x: Math.floor(Math.random() * (GRID_WIDTH / SEGMENT_SIZE)) * SEGMENT_SIZE,
    y: Math.floor(Math.random() * (GRID_HEIGHT / SEGMENT_SIZE)) * SEGMENT_SIZE,
    direction: "right",
    segments: [{ x: 0, y: 0 }],
    score: 0,
  };

  socket.emit("initialize", { players, food });
  socket.broadcast.emit("player-joined", {
    id: socket.id,
    player: players[socket.id],
  });

  socket.on("move", (direction) => {
    const player = players[socket.id];
    if (!player) return;
     if (
       (direction === "up" && player.direction !== "down") ||
       (direction === "down" && player.direction !== "up") ||
       (direction === "left" && player.direction !== "right") ||
       (direction === "right" && player.direction !== "left")
     ) {
       player.direction = direction;
     }
  });

  startGameLoop();

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("player-left", socket.id);
    console.log(`Player disconnected: ${socket.id}`);
  });
});

function startGameLoop() {

  if(!gameInterval){
    gameInterval = setInterval(() => {
      updateGameState();
    }, MOVEMENT_SPEED);
  }
}

function updateGameState() {
  let hasEatenFood = false;
  Object.keys(players).forEach((id) => {
    const player = players[id];
    movePlayer(player);

    if (player.x === food.x && player.y === food.y) {
      player.score++;
      hasEatenFood = true;
      player.segments.push({ ...player.segments[player.segments.length - 1] });
      food = generateRandomFood(); 
      io.emit("food-update", food);
    }
  });

  if (!hasEatenFood) checkCollisions();

  io.emit("state-update", players);
}

function movePlayer(player) {
  const head = { ...player.segments[0] };

  switch (player.direction) {
    case "up":
      head.y -= SEGMENT_SIZE;
      break;
    case "down":
      head.y += SEGMENT_SIZE;
      break;
    case "left":
      head.x -= SEGMENT_SIZE;
      break;
    case "right":
      head.x += SEGMENT_SIZE;
      break;
  }

 if (head.x < 0) head.x = GRID_WIDTH - SEGMENT_SIZE;
 if (head.x >= GRID_WIDTH) head.x = 0;
 if (head.y < 0) head.y = GRID_HEIGHT - SEGMENT_SIZE;
 if (head.y >= GRID_HEIGHT) head.y = 0;

  player.segments = [
    head,
    ...player.segments.slice(0, player.segments.length - 1),
  ];
  player.x = head.x;
  player.y = head.y;
}

const checkCollisions = () => {
  Object.keys(players).forEach(id => {
    const player = players[id];
    const head = player.segments[0];

    const selfCollision = player.segments
      .slice(1)
      .some((segment) => segment.x === head.x && segment.y === head.y);

    if (selfCollision) {
      console.log(`Game over for player ${id} (self-collision)`);
      io.to(id).emit("game-over", { reason: "self-collision" });
      delete players[id];
      io.emit("player-left", id);
      return;
    }


    Object.keys(players).forEach(otherId => {
      if(id !== otherId){
        const otherPlayer = players[otherId];
        const collision = otherPlayer.segments.some(
          (segment) => segment.x === head.x && segment.y === head.y
        );

        if(collision){
          otherPlayer.score += 5;
          console.log(`Game over for player ${id}`);
          io.to(id).emit("game-over", { reason: "collision-with-other-snake" });
          delete players[id]; 
          io.emit("player-left", id);  
        }
      }
    })
  })
}

server.listen(5000, () => {
  console.log("Server is running on port 5000");
});
