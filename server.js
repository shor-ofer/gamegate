const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store games and their participants
const games = new Map();
const userSockets = new Map(); // Map socket.id to user info

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game class to manage game state
class Game {
  constructor(id, creatorName, creatorSocketId, isPublic = true) {
    this.id = id;
    this.users = new Map(); // userId -> { name, socketId, peerId }
    this.counter = 0;
    this.createdAt = new Date();
    this.status = 'waiting'; // 'waiting', 'playing'
    this.creatorSocketId = creatorSocketId;
    this.isPublic = isPublic;
    
    // Add creator
    this.addUser(creatorSocketId, creatorName, null);
  }

  addUser(socketId, name, peerId = null) {
    const userId = uuidv4();
    this.users.set(userId, {
      id: userId,
      name,
      socketId,
      peerId,
      joinedAt: new Date()
    });
    return userId;
  }

  removeUser(socketId) {
    for (const [userId, user] of this.users.entries()) {
      if (user.socketId === socketId) {
        this.users.delete(userId);
        return user;
      }
    }
    return null;
  }

  updateUserPeerId(socketId, peerId) {
    for (const [userId, user] of this.users.entries()) {
      if (user.socketId === socketId) {
        user.peerId = peerId;
        return true;
      }
    }
    return false;
  }

  getUserBySocketId(socketId) {
    for (const user of this.users.values()) {
      if (user.socketId === socketId) {
        return user;
      }
    }
    return null;
  }

  incrementCounter() {
    this.counter++;
    return this.counter;
  }

  startGame() {
    this.status = 'playing';
    return this.status;
  }

  isCreator(socketId) {
    return this.creatorSocketId === socketId;
  }

  getGameState() {
    return {
      id: this.id,
      counter: this.counter,
      status: this.status,
      isPublic: this.isPublic,
      users: Array.from(this.users.values()).map(user => ({
        id: user.id,
        name: user.name,
        peerId: user.peerId
      }))
    };
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Join lobby room to receive public game updates
  socket.join('lobby');

  // Create new game
  socket.on('createGame', (data) => {
    const { userName, isPublic = true } = data;
    if (!userName) {
      socket.emit('error', { message: 'User name is required' });
      return;
    }

    const gameId = uuidv4().substring(0, 8).toUpperCase(); // Short game ID
    const game = new Game(gameId, userName, socket.id, isPublic);
    games.set(gameId, game);

    // Store user info
    userSockets.set(socket.id, { gameId, userName });

    // Join the socket room
    socket.join(gameId);

    socket.emit('gameCreated', {
      gameId,
      gameState: game.getGameState()
    });

    // If game is public, broadcast to all users in lobby
    if (isPublic) {
      socket.to('lobby').emit('publicGameCreated', {
        id: game.id,
        userCount: game.users.size,
        createdAt: game.createdAt,
        creatorName: userName
      });
    }

    console.log(`Game ${gameId} created by ${userName} (${isPublic ? 'public' : 'private'})`);
  });

  // Join existing game
  socket.on('joinGame', (data) => {
    const { gameId, userName } = data;
    if (!gameId || !userName) {
      socket.emit('error', { message: 'Game ID and user name are required' });
      return;
    }

    const game = games.get(gameId.toUpperCase());
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Check if game has already started
    if (game.status === 'playing') {
      socket.emit('error', { message: 'Game has already started' });
      return;
    }

    // Add user to game
    const userId = game.addUser(socket.id, userName);
    
    // Store user info
    userSockets.set(socket.id, { gameId: gameId.toUpperCase(), userName });

    // Join the socket room
    socket.join(gameId.toUpperCase());

    // Notify all users in the game about the new user
    socket.to(gameId.toUpperCase()).emit('userJoined', {
      user: { id: userId, name: userName, peerId: null }
    });

    // Send current game state to the new user
    socket.emit('gameJoined', {
      gameState: game.getGameState()
    });

    console.log(`${userName} joined game ${gameId}`);
  });

  // Update peer ID
  socket.on('updatePeerId', (data) => {
    const { peerId } = data;
    const userInfo = userSockets.get(socket.id);
    
    if (!userInfo || !peerId) {
      socket.emit('error', { message: 'Invalid peer ID or user not in game' });
      return;
    }

    const game = games.get(userInfo.gameId);
    if (game && game.updateUserPeerId(socket.id, peerId)) {
      // Broadcast peer ID to all other users in the game
      socket.to(userInfo.gameId).emit('userPeerIdUpdated', {
        user: game.getUserBySocketId(socket.id)
      });
      
      console.log(`Peer ID updated for ${userInfo.userName}: ${peerId}`);
    }
  });

  // Increment counter
  socket.on('incrementCounter', () => {
    const userInfo = userSockets.get(socket.id);
    if (!userInfo) {
      socket.emit('error', { message: 'User not in any game' });
      return;
    }

    const game = games.get(userInfo.gameId);
    if (game) {
      // Only allow counter increment if game is playing
      if (game.status !== 'playing') {
        socket.emit('error', { message: 'Game has not started yet' });
        return;
      }

      const newCounter = game.incrementCounter();
      
      // Broadcast counter update to all users in the game
      io.to(userInfo.gameId).emit('counterUpdated', {
        counter: newCounter,
        updatedBy: userInfo.userName
      });

      console.log(`Counter incremented to ${newCounter} by ${userInfo.userName} in game ${userInfo.gameId}`);
    }
  });

  // Start game (only creator can start)
  socket.on('startGame', () => {
    const userInfo = userSockets.get(socket.id);
    if (!userInfo) {
      socket.emit('error', { message: 'User not in any game' });
      return;
    }

    const game = games.get(userInfo.gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Check if user is the creator
    if (!game.isCreator(socket.id)) {
      socket.emit('error', { message: 'Only the game creator can start the game' });
      return;
    }

    // Check if game is already started
    if (game.status === 'playing') {
      socket.emit('error', { message: 'Game is already started' });
      return;
    }

    game.startGame();
    
    // Broadcast game start to all users in the game
    io.to(userInfo.gameId).emit('gameStarted', {
      gameState: game.getGameState()
    });

    // If game was public, broadcast removal to lobby users
    if (game.isPublic) {
      socket.to('lobby').emit('publicGameStarted', {
        gameId: userInfo.gameId
      });
    }

    console.log(`Game ${userInfo.gameId} started by ${userInfo.userName}`);
  });

  // Get current game state
  socket.on('getGameState', () => {
    const userInfo = userSockets.get(socket.id);
    if (!userInfo) {
      socket.emit('error', { message: 'User not in any game' });
      return;
    }

    const game = games.get(userInfo.gameId);
    if (game) {
      socket.emit('gameState', game.getGameState());
    }
  });

  // Handle user leaving game voluntarily
  socket.on('leaveGame', () => {
    const userInfo = userSockets.get(socket.id);
    if (!userInfo) {
      socket.emit('error', { message: 'User not in any game' });
      return;
    }

    const game = games.get(userInfo.gameId);
    if (game) {
      const removedUser = game.removeUser(socket.id);
      if (removedUser) {
        // Leave the socket room
        socket.leave(userInfo.gameId);
        
        // Notify other users about the user leaving
        socket.to(userInfo.gameId).emit('userLeft', {
          user: removedUser
        });

        console.log(`${removedUser.name} voluntarily left game ${userInfo.gameId}. Users remaining: ${game.users.size}`);
        
        // Only close game if NO users remain
        if (game.users.size === 0) {
          games.delete(userInfo.gameId);
          
          // If it was a public game, broadcast removal to lobby users
          if (game.isPublic) {
            io.to('lobby').emit('publicGameRemoved', {
              gameId: userInfo.gameId
            });
          }
          
          console.log(`Game ${userInfo.gameId} deleted - no users remaining`);
        }
      }
    }
    
    // Clean up user info
    userSockets.delete(socket.id);
    
    // Confirm to the user that they've left
    socket.emit('gameLeft');
  });

  // Handle leaving lobby
  socket.on('leaveLobby', () => {
    socket.leave('lobby');
  });

  // Handle joining lobby
  socket.on('joinLobby', () => {
    socket.join('lobby');
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const userInfo = userSockets.get(socket.id);
    if (userInfo) {
      const game = games.get(userInfo.gameId);
      if (game) {
        const removedUser = game.removeUser(socket.id);
        if (removedUser) {
          // Notify other users about the disconnection
          socket.to(userInfo.gameId).emit('userLeft', {
            user: removedUser
          });

          console.log(`${removedUser.name} disconnected from game ${userInfo.gameId}. Users remaining: ${game.users.size}`);

          // Only close game if NO users remain
          if (game.users.size === 0) {
            games.delete(userInfo.gameId);
            
            // If it was a public game, broadcast removal to lobby users
            if (game.isPublic) {
              io.to('lobby').emit('publicGameRemoved', {
                gameId: userInfo.gameId
              });
            }
            
            console.log(`Game ${userInfo.gameId} deleted - no users remaining`);
          }
        }
      }
      userSockets.delete(socket.id);
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

// API Routes
app.get('/api/games', (req, res) => {
  const gameList = Array.from(games.values()).map(game => ({
    id: game.id,
    userCount: game.users.size,
    counter: game.counter,
    status: game.status,
    isPublic: game.isPublic,
    createdAt: game.createdAt
  }));
  res.json(gameList);
});

app.get('/api/games/public', (req, res) => {
  const publicGames = Array.from(games.values())
    .filter(game => game.isPublic && game.status === 'waiting')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20)
    .map(game => ({
      id: game.id,
      userCount: game.users.size,
      createdAt: game.createdAt,
      creatorName: Array.from(game.users.values())[0]?.name || 'Unknown'
    }));
  res.json(publicGames);
});

app.get('/api/games/:gameId', (req, res) => {
  const game = games.get(req.params.gameId.toUpperCase());
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json(game.getGameState());
});

// Start server
const PORT = process.env.PORT || 3000;

// Debug: Log current directory and file structure
console.log('Current working directory:', process.cwd());
console.log('Public directory:', path.join(__dirname, 'public'));

const publicDir = path.join(__dirname, 'public');
const indexFile = path.join(publicDir, 'index.html');

if (fs.existsSync(publicDir)) {
  console.log('✓ Public directory found');
} else {
  console.log('✗ Public directory not found');
}

if (fs.existsSync(indexFile)) {
  console.log('✓ index.html found');
} else {
  console.log('✗ index.html not found');
}

server.listen(PORT, () => {
  console.log(`P2P Game Server running on port ${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Open http://localhost:${PORT} to access the game`);
  }
});