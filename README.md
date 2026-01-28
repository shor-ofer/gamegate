# P2P Counter Game

A real-time peer-to-peer multiplayer game built with Express.js, Socket.io, and PeerJS. Players can create or join games using unique game IDs and interact through both WebSocket and peer-to-peer connections.

## Features

- **Game Creation**: First player creates a game with a unique 8-character ID
- **Game Joining**: Other players can join using the game ID
- **Multiple Games**: Multiple games can run simultaneously on the same server
- **Real-time Communication**: Uses WebSocket for signaling and P2P for game data
- **User Management**: Players must provide their name when joining
- **Counter Game**: Simple counter game where any player can increment the value
- **Live Updates**: All players see counter changes in real-time via P2P connections
- **Player List**: Shows all players currently in the game
- **Connection Status**: Displays P2P connection status for each player

## How to Use

### Starting the Server

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

### Creating a Game

1. Enter your name in the "Your Name" field
2. Click "Create New Game"
3. Share the generated Game ID with other players

### Joining a Game

1. Enter your name in the "Your Name" field
2. Enter the Game ID provided by the game creator
3. Click "Join Game"

### Playing the Game

- Once in a game, you'll see:
  - Current counter value
  - List of all players in the game
  - P2P connection status with other players
  - Button to increment the counter

- Click the "Click to Increment (+1)" button to increase the counter
- All other players will see the change immediately via P2P connections
- The change is also synchronized via WebSocket for reliability

## Technical Architecture

### Server Components

- **Express.js**: Web server hosting static files and API endpoints
- **Socket.io**: WebSocket server for real-time communication
- **Game Management**: In-memory storage of game states and user sessions
- **UUID**: Generation of unique game and user IDs

### Client Components

- **Socket.io Client**: WebSocket client for server communication
- **PeerJS**: P2P connection management using WebRTC
- **Game Logic**: Counter game implementation with real-time updates
- **UI Management**: Dynamic interface updates based on game state

### Communication Flow

1. **Game Creation/Joining**: Via WebSocket to server
2. **Peer Discovery**: Server broadcasts peer IDs to all players in game
3. **P2P Connection**: Players establish direct WebRTC connections
4. **Game Updates**: Sent via both WebSocket and P2P for reliability
5. **User Management**: Server tracks all players and their connection states

## API Endpoints

- `GET /`: Serve the game interface
- `GET /api/games`: List all active games
- `GET /api/games/:gameId`: Get specific game state

## WebSocket Events

### Client to Server
- `createGame`: Create a new game
- `joinGame`: Join an existing game
- `updatePeerId`: Update user's peer ID
- `incrementCounter`: Increment the game counter
- `getGameState`: Get current game state

### Server to Client
- `gameCreated`: Game successfully created
- `gameJoined`: Successfully joined a game
- `userJoined`: New user joined the game
- `userLeft`: User left the game
- `userPeerIdUpdated`: User's peer ID was updated
- `counterUpdated`: Counter value changed
- `error`: Error message

## P2P Messages

- `counterIncrement`: Counter was incremented by a peer
- `counterSync`: Synchronize counter value between peers

## File Structure

```
cardtest/
├── package.json          # Project dependencies and scripts
├── server.js            # Express server with WebSocket support
├── README.md           # This file
└── public/
    ├── index.html      # Game interface
    └── game.js         # Client-side game logic
```

## Development

For development with auto-restart:
```bash
npm run dev
```

## Requirements

- Node.js 14+ 
- Modern web browser with WebRTC support
- Network connection for P2P functionality

## Troubleshooting

### P2P Connection Issues
- Ensure both users are on networks that support WebRTC
- Some corporate firewalls may block P2P connections
- WebSocket fallback ensures basic functionality even if P2P fails

### Game Not Found
- Verify the Game ID is entered correctly (case-insensitive)
- Game may have been deleted if all players left

### Connection Problems
- Check browser console for detailed error messages
- Refresh the page and try rejoining the game
- Ensure server is running and accessible

## Future Enhancements

- Persistent game storage
- More complex game mechanics
- Audio/video communication
- Mobile-responsive design
- Game history and statistics
- Player authentication