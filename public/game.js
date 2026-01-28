class GameClient {
    constructor() {
        this.socket = null;
        this.peer = null;
        this.connections = new Map(); // peerId -> connection
        this.gameState = null;
        this.currentGameId = null;
        this.currentUserName = null;
        this.publicGames = []; // Store current public games
        
        this.initializeElements();
        this.initializeSocket();
        this.setupEventListeners();
        
        // Initialize debug mode state
        this.toggleDebugMode();
    }

    initializeElements() {
        // Lobby elements
        this.lobbySection = document.getElementById('lobby');
        this.gameSection = document.getElementById('gameSection');
        this.userNameInput = document.getElementById('userName');
        this.gameIdInput = document.getElementById('gameId');
        this.gameIsPublicCheckbox = document.getElementById('gameIsPublic');
        this.createGameBtn = document.getElementById('createGameBtn');
        this.joinGameBtn = document.getElementById('joinGameBtn');
        this.publicGamesList = document.getElementById('publicGamesList');
        
        // Game elements
        this.currentGameIdElement = document.getElementById('currentGameId');
        this.gameStatusElement = document.getElementById('gameStatus');
        this.playerCountElement = document.getElementById('playerCount');
        this.counterValueElement = document.getElementById('counterValue');
        this.incrementBtn = document.getElementById('incrementBtn');
        this.startGameBtn = document.getElementById('startGameBtn');
        this.startGameSection = document.getElementById('startGameSection');
        this.waitingRoom = document.getElementById('waitingRoom');
        this.gamePlayingSection = document.getElementById('gamePlayingSection');
        this.usersListElement = document.getElementById('usersList');
        this.connectionsListElement = document.getElementById('connectionsList');
        this.leaveGameBtn = document.getElementById('leaveGameBtn');
        this.statusMessagesElement = document.getElementById('statusMessages');
        
        // Check for debug mode from URL parameter
        this.isDebugMode = new URLSearchParams(window.location.search).get('debug') === '1';
        this.p2pConnectionsSection = document.getElementById('p2pConnectionsSection');
        
        // Server status elements
        this.serverStatusElement = document.getElementById('serverStatus');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        
        // Track connection state
        this.isServerConnected = false;
    }

    initializeSocket() {
        this.socket = io();
        
        // Connection status handlers
        this.socket.on('connect', () => {
            this.isServerConnected = true;
            this.updateServerStatus('connected', '🟢', 'Connected to server');
            this.updateUIState();
        });
        
        this.socket.on('disconnect', () => {
            this.isServerConnected = false;
            this.updateServerStatus('disconnected', '🔴', 'Server disconnected - P2P features still available');
            this.updateUIState();
        });
        
        this.socket.on('connect_error', () => {
            this.isServerConnected = false;
            this.updateServerStatus('disconnected', '❌', 'Cannot connect to server');
            this.updateUIState();
        });
        
        // Socket event listeners
        this.socket.on('gameCreated', (data) => {
            this.handleGameCreated(data);
        });

        this.socket.on('gameJoined', (data) => {
            this.handleGameJoined(data);
        });

        this.socket.on('userJoined', (data) => {
            this.handleUserJoined(data);
        });

        this.socket.on('userLeft', (data) => {
            this.handleUserLeft(data);
        });

        this.socket.on('userPeerIdUpdated', (data) => {
            this.handleUserPeerIdUpdated(data);
        });

        this.socket.on('gameStarted', (data) => {
            this.handleGameStarted(data);
        });

        this.socket.on('publicGameCreated', (data) => {
            this.handlePublicGameCreated(data);
        });

        this.socket.on('publicGameStarted', (data) => {
            this.handlePublicGameStarted(data);
        });

        this.socket.on('publicGameRemoved', (data) => {
            this.handlePublicGameRemoved(data);
        });

        this.socket.on('gameLeft', () => {
            // Server confirmed we left the game
            console.log('Successfully left the game');
        });

        this.socket.on('error', (data) => {
            this.showStatus(data.message, 'error');
        });
        
        // Set initial connecting status
        this.updateServerStatus('connecting', '🔄', 'Connecting to server...');
    }

    setupEventListeners() {
        this.createGameBtn.addEventListener('click', () => {
            this.createGame();
        });

        this.joinGameBtn.addEventListener('click', () => {
            this.joinGame();
        });

        this.incrementBtn.addEventListener('click', () => {
            this.incrementCounter();
        });

        this.startGameBtn.addEventListener('click', () => {
            this.startGame();
        });

        this.leaveGameBtn.addEventListener('click', () => {
            this.leaveGame();
        });

        // Enter key support
        this.userNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createGame();
            }
        });

        this.gameIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinGame();
            }
        });

        // Load public games on initialization
        this.loadPublicGames();
    }

    createGame() {
        const userName = this.userNameInput.value.trim();
        const isPublic = this.gameIsPublicCheckbox.checked;
        
        if (!this.isServerConnected) {
            this.showStatus('Cannot create game - server is disconnected', 'error');
            return;
        }
        
        if (!userName) {
            this.showStatus('Please enter your name', 'error');
            return;
        }

        this.currentUserName = userName;
        this.socket.emit('createGame', { userName, isPublic });
        this.showStatus('Creating game...', 'info');
    }

    joinGame() {
        const userName = this.userNameInput.value.trim();
        const gameId = this.gameIdInput.value.trim().toUpperCase();
        
        if (!this.isServerConnected) {
            this.showStatus('Cannot join game - server is disconnected', 'error');
            return;
        }
        
        if (!userName || !gameId) {
            this.showStatus('Please enter your name and game ID', 'error');
            return;
        }

        this.currentUserName = userName;
        this.socket.emit('joinGame', { userName, gameId });
        this.showStatus('Joining game...', 'info');
    }

    joinPublicGame(gameId, creatorName) {
        const userName = this.userNameInput.value.trim();
        
        if (!this.isServerConnected) {
            this.showStatus('Cannot join game - server is disconnected', 'error');
            return;
        }
        
        if (!userName) {
            this.showStatus('Please enter your name first', 'error');
            return;
        }

        this.currentUserName = userName;
        this.socket.emit('joinGame', { userName, gameId });
        this.showStatus(`Joining ${creatorName}'s game...`, 'info');
    }

    async loadPublicGames() {
        try {
            const response = await fetch('/api/games/public');
            const games = await response.json();
            this.publicGames = games; // Store the games
            this.displayPublicGames(games);
        } catch (error) {
            console.error('Failed to load public games:', error);
            this.publicGamesList.innerHTML = '<div class="status error">Failed to load games</div>';
        }
    }

    displayPublicGames(games) {
        if (games.length === 0) {
            this.publicGamesList.innerHTML = '<div class="status info">No public games available</div>';
            return;
        }

        const gamesHTML = games.map(game => `
            <div class="game-item" onclick="gameClient.joinPublicGame('${game.id}', '${game.creatorName}')">
                <div class="game-info-item">
                    <div class="game-id">${game.id}</div>
                    <div class="game-creator">Created by ${game.creatorName}</div>
                </div>
                <div class="game-meta">
                    <div class="player-count">${game.userCount} player${game.userCount !== 1 ? 's' : ''}</div>
                    <div>${this.getTimeAgo(new Date(game.createdAt))}</div>
                </div>
            </div>
        `).join('');
        
        this.publicGamesList.innerHTML = gamesHTML;
    }

    getTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    startGame() {
        this.socket.emit('startGame');
        this.showStatus('Starting game...', 'info');
    }

    leaveGame() {
        // Notify server that user is leaving
        if (this.socket && this.currentGameId) {
            this.socket.emit('leaveGame');
        }
        
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        
        this.connections.clear();
        this.currentGameId = null;
        this.currentUserName = null;
        this.gameState = null;
        
        this.showLobby();
        this.showStatus('Left the game', 'info');
    }

    handleGameCreated(data) {
        this.currentGameId = data.gameId;
        this.gameState = data.gameState;
        this.showStatus(`Game created! Share this ID: ${data.gameId}`, 'success');
        this.showGame();
        this.initializePeer();
        this.updateGameDisplay();
    }

    handleGameJoined(data) {
        this.gameState = data.gameState;
        this.currentGameId = this.gameState.id;
        this.showStatus('Successfully joined the game!', 'success');
        this.showGame();
        this.initializePeer();
        this.updateGameDisplay();
    }

    handleGameStarted(data) {
        this.gameState = data.gameState;
        this.updateGameDisplay();
        this.showStatus('Game has started! 🎮', 'success');
        
        // Broadcast game start to all P2P connections
        this.broadcastToPeers({
            type: 'gameStarted',
            gameState: data.gameState
        });
    }

    handlePublicGameCreated(gameData) {
        // Add new public game to the list if we're in lobby
        if (this.lobbySection.style.display !== 'none') {
            this.publicGames.unshift(gameData); // Add to beginning
            if (this.publicGames.length > 20) {
                this.publicGames = this.publicGames.slice(0, 20); // Keep only latest 20
            }
            this.displayPublicGames(this.publicGames);
        }
    }

    handlePublicGameStarted(data) {
        // Remove started game from public list if we're in lobby
        if (this.lobbySection.style.display !== 'none') {
            this.publicGames = this.publicGames.filter(game => game.id !== data.gameId);
            this.displayPublicGames(this.publicGames);
        }
    }

    handlePublicGameRemoved(data) {
        // Remove empty game from public list if we're in lobby
        if (this.lobbySection.style.display !== 'none') {
            this.publicGames = this.publicGames.filter(game => game.id !== data.gameId);
            this.displayPublicGames(this.publicGames);
        }
    }

    handleUserJoined(data) {
        this.gameState.users.push(data.user);
        this.updateGameDisplay();
        this.showStatus(`${data.user.name} joined the game`, 'info');
        
        // Broadcast user join to all existing P2P connections
        this.broadcastToPeers({
            type: 'userJoined',
            user: data.user
        });
    }

    handleUserLeft(data) {
        this.gameState.users = this.gameState.users.filter(user => user.id !== data.user.id);
        
        // Close P2P connection if exists
        if (data.user.peerId && this.connections.has(data.user.peerId)) {
            this.connections.get(data.user.peerId).close();
            this.connections.delete(data.user.peerId);
        }
        
        this.updateGameDisplay();
        this.showStatus(`${data.user.name} left the game`, 'info');
        
        // Broadcast user leave to remaining P2P connections
        this.broadcastToPeers({
            type: 'userLeft',
            user: data.user
        });
    }

    handleUserPeerIdUpdated(data) {
        // Update user in gameState
        const userIndex = this.gameState.users.findIndex(user => user.id === data.user.id);
        if (userIndex !== -1) {
            this.gameState.users[userIndex] = data.user;
        }
        
        this.updateGameDisplay();
        this.connectToPeer(data.user.peerId, data.user.name);
    }

    initializePeer() {
        this.peer = new Peer();
        
        this.peer.on('open', (peerId) => {
            console.log('Peer ID:', peerId);
            this.socket.emit('updatePeerId', { peerId });
        });

        this.peer.on('connection', (conn) => {
            this.handleIncomingConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            this.showStatus(`P2P Connection error: ${err.message}`, 'error');
        });
    }

    connectToPeer(peerId, userName) {
        if (peerId === this.peer.id || this.connections.has(peerId)) {
            return; // Don't connect to self or already connected peer
        }

        try {
            const conn = this.peer.connect(peerId);
            this.setupPeerConnection(conn, userName);
        } catch (error) {
            console.error('Failed to connect to peer:', error);
        }
    }

    handleIncomingConnection(conn) {
        const user = this.gameState.users.find(u => u.peerId === conn.peer);
        const userName = user ? user.name : 'Unknown';
        this.setupPeerConnection(conn, userName);
    }

    setupPeerConnection(conn, userName) {
        this.connections.set(conn.peer, conn);

        conn.on('open', () => {
            console.log(`Connected to ${userName} (${conn.peer})`);
            this.updateConnectionStatus(conn.peer, 'connected');
            
            // Send current game state for synchronization
            conn.send({
                type: 'gameStateSync',
                gameState: this.gameState,
                counter: this.gameState.counter
            });
        });

        conn.on('data', (data) => {
            this.handlePeerData(data, conn.peer, userName);
        });

        conn.on('close', () => {
            console.log(`Disconnected from ${userName}`);
            this.connections.delete(conn.peer);
            this.updateConnectionStatus(conn.peer, 'disconnected');
        });

        conn.on('error', (err) => {
            console.error(`Connection error with ${userName}:`, err);
            this.updateConnectionStatus(conn.peer, 'error');
        });

        this.updateConnectionStatus(conn.peer, 'connecting');
    }

    handlePeerData(data, peerId, userName) {
        switch (data.type) {
            case 'counterIncrement':
                this.gameState.counter = data.counter;
                this.counterValueElement.textContent = data.counter;
                this.showStatus(`${userName} incremented the counter via P2P!`, 'info');
                break;
            
            case 'counterSync':
                // Handle counter synchronization
                if (data.counter > this.gameState.counter) {
                    this.gameState.counter = data.counter;
                    this.counterValueElement.textContent = data.counter;
                }
                break;
                
            case 'gameStateSync':
                // Handle full game state synchronization for new connections
                if (data.gameState) {
                    // Update counter if newer
                    if (data.counter > this.gameState.counter) {
                        this.gameState.counter = data.counter;
                        this.counterValueElement.textContent = data.counter;
                    }
                    
                    // Merge user lists (avoid duplicates)
                    const currentUserIds = this.gameState.users.map(u => u.id);
                    const newUsers = data.gameState.users.filter(u => !currentUserIds.includes(u.id));
                    this.gameState.users.push(...newUsers);
                    
                    this.updateGameDisplay();
                }
                break;
            
            case 'userJoined':
                // Add user to gameState if not already present
                const existingUserIndex = this.gameState.users.findIndex(u => u.id === data.user.id);
                if (existingUserIndex === -1) {
                    this.gameState.users.push(data.user);
                    this.updateGameDisplay();
                    this.showStatus(`${data.user.name} joined the game`, 'info');
                    
                    // Connect to new user if they have a peerId
                    if (data.user.peerId && data.user.peerId !== this.peer.id) {
                        this.connectToPeer(data.user.peerId, data.user.name);
                    }
                }
                break;
                
            case 'userLeft':
                // Remove user from gameState
                this.gameState.users = this.gameState.users.filter(user => user.id !== data.user.id);
                
                // Close P2P connection if exists
                if (data.user.peerId && this.connections.has(data.user.peerId)) {
                    this.connections.get(data.user.peerId).close();
                    this.connections.delete(data.user.peerId);
                }
                
                this.updateGameDisplay();
                this.showStatus(`${data.user.name} left the game`, 'info');
                break;
                
            case 'gameStarted':
                this.gameState.status = 'playing';
                this.updateGameDisplay();
                this.showStatus('Game has started! 🎮', 'success');
                break;
                
            default:
                console.log('Unknown P2P message:', data);
        }
    }

    incrementCounter() {
        // Increment locally first
        this.gameState.counter++;
        this.counterValueElement.textContent = this.gameState.counter;
        
        // Send ONLY via P2P to all connected peers (no WebSocket)
        this.broadcastToPeers({
            type: 'counterIncrement',
            counter: this.gameState.counter,
            updatedBy: this.currentUserName
        });
    }

    broadcastToPeers(data) {
        this.connections.forEach((conn, peerId) => {
            if (conn.open) {
                try {
                    conn.send(data);
                } catch (error) {
                    console.error('Failed to send to peer:', error);
                }
            }
        });
    }

    updateGameDisplay() {
        if (!this.gameState) return;

        this.currentGameIdElement.textContent = this.gameState.id;
        this.gameStatusElement.textContent = this.gameState.status === 'waiting' ? 'Waiting Room' : 'Playing';
        this.playerCountElement.textContent = this.gameState.users.length;
        this.counterValueElement.textContent = this.gameState.counter;

        // Show appropriate sections based on game status
        if (this.gameState.status === 'waiting') {
            this.waitingRoom.style.display = 'block';
            this.gamePlayingSection.style.display = 'none';
            
            // Check if current user is the creator
            const isCreator = this.gameState.users.length > 0 && 
                             this.gameState.users[0].name === this.currentUserName;
            
            if (isCreator) {
                this.startGameSection.style.display = 'block';
            } else {
                this.startGameSection.style.display = 'none';
            }
        } else {
            this.waitingRoom.style.display = 'none';
            this.gamePlayingSection.style.display = 'block';
        }

        // Update users list
        this.usersListElement.innerHTML = '';
        this.gameState.users.forEach((user, index) => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            const isCurrentUser = user.name === this.currentUserName;
            const isCreator = index === 0;
            let status = isCurrentUser ? '🔵 You' : (user.peerId ? '🟢 Online' : '🔄 Connecting...');
            if (isCreator) {
                status += ' 👑';
            }
            userItem.innerHTML = `
                <span>${user.name}${isCreator ? ' (Creator)' : ''}</span>
                <span>${status}</span>
            `;
            this.usersListElement.appendChild(userItem);
        });

        // Update connections list
        this.updateConnectionsList();
    }

    updateConnectionsList() {
        this.connectionsListElement.innerHTML = '';
        
        if (this.connections.size === 0) {
            const otherUsersCount = this.gameState ? this.gameState.users.filter(u => u.name !== this.currentUserName).length : 0;
            if (otherUsersCount === 0) {
                this.connectionsListElement.innerHTML = '<p class="status info">Waiting for other players to join...</p>';
            } else {
                this.connectionsListElement.innerHTML = '<p class="status info">Establishing P2P connections...</p>';
            }
            return;
        }

        this.connections.forEach((conn, peerId) => {
            const user = this.gameState.users.find(u => u.peerId === peerId);
            const userName = user ? user.name : 'Unknown';
            
            const connectionItem = document.createElement('div');
            connectionItem.className = 'connection-item';
            connectionItem.innerHTML = `
                <span>${userName}</span>
                <span class="connection-status ${conn.open ? 'connected' : 'disconnected'}">
                    ${conn.open ? 'Connected' : 'Disconnected'}
                </span>
            `;
            this.connectionsListElement.appendChild(connectionItem);
        });
    }

    updateConnectionStatus(peerId, status) {
        // This will be updated in the next updateConnectionsList call
        setTimeout(() => this.updateConnectionsList(), 100);
    }

    showGame() {
        this.lobbySection.style.display = 'none';
        this.gameSection.style.display = 'block';
        
        // Leave lobby room since we're no longer viewing public games
        this.socket.emit('leaveLobby');
    }

    showLobby() {
        this.lobbySection.style.display = 'block';
        this.gameSection.style.display = 'none';
        
        // Update UI state based on server connection
        this.updateUIState();
        
        // Rejoin lobby room to receive public game updates
        if (this.isServerConnected) {
            this.socket.emit('joinLobby');
            // Reload public games when returning to lobby
            this.loadPublicGames();
        }
        
        // Clear inputs
        this.userNameInput.value = '';
        this.gameIdInput.value = '';
    }

    showStatus(message, type = 'info') {
        const statusDiv = document.createElement('div');
        statusDiv.className = `status ${type}`;
        statusDiv.textContent = message;
        
        // Append to body instead of statusMessagesElement for full-screen positioning
        document.body.appendChild(statusDiv);
        
        // Remove after animation completes (1.5 seconds)
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.parentNode.removeChild(statusDiv);
            }
        }, 1500);
    }

    toggleDebugMode() {
        if (this.isDebugMode) {
            this.p2pConnectionsSection.style.display = 'block';
            // Add debug styling
            this.p2pConnectionsSection.style.border = '2px dashed #007bff';
            this.p2pConnectionsSection.style.backgroundColor = '#f8f9ff';
            
            // Add DEBUG label to the heading
            const heading = this.p2pConnectionsSection.querySelector('h3');
            if (heading && !heading.textContent.includes('(DEBUG)')) {
                heading.innerHTML = heading.innerHTML + ' <span style="color: #007bff; font-size: 0.8em; font-weight: normal;">(DEBUG)</span>';
            }
            
            console.log('Debug mode enabled via URL parameter - P2P Connections section is visible');
        } else {
            this.p2pConnectionsSection.style.display = 'none';
            console.log('Debug mode disabled - P2P Connections section is hidden');
        }
    }

    updateServerStatus(status, indicator, text) {
        this.serverStatusElement.className = `server-status ${status}`;
        this.statusIndicator.textContent = indicator;
        this.statusText.textContent = text;
    }

    updateUIState() {
        // Disable server-dependent features when disconnected
        const serverDependentElements = [
            this.createGameBtn,
            this.joinGameBtn,
            this.userNameInput,
            this.gameIdInput,
            this.gameIsPublicCheckbox,
            this.publicGamesList
        ];
        
        if (this.isServerConnected) {
            // Enable server-dependent features
            serverDependentElements.forEach(element => {
                if (element) element.style.pointerEvents = 'auto';
            });
            
            // Remove disabled class from lobby sections
            const lobbyInputs = document.querySelector('#lobby');
            if (lobbyInputs) {
                lobbyInputs.classList.remove('disabled-section');
            }
        } else {
            // Disable server-dependent features
            serverDependentElements.forEach(element => {
                if (element) element.style.pointerEvents = 'none';
            });
            
            // Add disabled class to lobby sections
            const lobbyInputs = document.querySelector('#lobby');
            if (lobbyInputs && this.lobbySection.style.display !== 'none') {
                lobbyInputs.classList.add('disabled-section');
            }
        }
    }
}

// Initialize the game client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.gameClient = new GameClient();
});