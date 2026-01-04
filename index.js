const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let rooms = {};

function generateMap() {
    let obs = [];
    // Generate 10 obstacles at completely random positions
    for (let i = 0; i < 10; i++) {
        obs.push({
            id: 'OBS'+i,
            x: 100 + Math.random() * 1800, // Random X across the map (leaving margins)
            y: 100 + Math.random() * 1000, // Random Y across the map (leaving margins)
            w: 70,
            h: 70,
            hp: 3
        });
    }
    return obs;
}

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('joinRoom', (data) => {
        const roomName = typeof data === 'string' ? data : data.room;
        const playerClass = typeof data === 'string' ? 'balanced' : data.class;

        currentRoom = roomName;

        if (!rooms[roomName]) {
            rooms[roomName] = {
                players: [],
                playerClasses: {},
                map: generateMap(),
                activeItems: {}, // Track items by ID
                itemSpawner: null // Store interval reference
            };

            // ITEM SPAWNER: Runs every 10 seconds
            rooms[roomName].itemSpawner = setInterval(() => {
                // Check if room still exists and has players
                if (!rooms[roomName] || rooms[roomName].players.length === 0) {
                    clearInterval(rooms[roomName].itemSpawner);
                    return;
                }

                const types = ['health', 'rocket', 'triple', 'shield'];
                const id = Date.now();
                const item = {
                    type: types[Math.floor(Math.random() * types.length)],
                    x: 300 + Math.random() * 600,
                    y: 100 + Math.random() * 400,
                    id: id
                };

                rooms[roomName].activeItems[id] = item;
                io.to(roomName).emit('spawnItem', item);

                // DESPAWN TIMER: Remove after 4 seconds if not collected
                setTimeout(() => {
                    if (rooms[roomName] && rooms[roomName].activeItems[id]) {
                        delete rooms[roomName].activeItems[id];
                        io.to(roomName).emit('removeItem', id);
                    }
                }, 4000);

            }, 10000);
        }

        if (rooms[roomName].players.length < 2) {
            socket.join(roomName);
            rooms[roomName].players.push(socket.id);
            rooms[roomName].playerClasses[socket.id] = playerClass;

            const side = rooms[roomName].players.length === 1 ? 'left' : 'right';
            socket.emit('init', { side, roomName, map: rooms[roomName].map });

            if (rooms[roomName].players.length === 2) {
                // Send both players' classes when starting game
                const player1Id = rooms[roomName].players[0];
                const player2Id = rooms[roomName].players[1];

                io.to(player1Id).emit('startGame', {
                    opponentClass: rooms[roomName].playerClasses[player2Id]
                });
                io.to(player2Id).emit('startGame', {
                    opponentClass: rooms[roomName].playerClasses[player1Id]
                });
            }
        }
    });

    socket.on('sync', (data) => {
        if (data.action === 'itemPickup' && rooms[data.room]) {
            delete rooms[data.room].activeItems[data.id];
        }
        socket.to(data.room).emit('opponentSync', data);
    });

    // Handle player disconnect
    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            // Remove player from room
            rooms[currentRoom].players = rooms[currentRoom].players.filter(id => id !== socket.id);

            // If room is empty, clean it up
            if (rooms[currentRoom].players.length === 0) {
                // Clear the item spawner interval
                if (rooms[currentRoom].itemSpawner) {
                    clearInterval(rooms[currentRoom].itemSpawner);
                }
                // Delete the room
                delete rooms[currentRoom];
                console.log(`Room ${currentRoom} deleted - no players remaining`);
            } else {
                // Notify remaining player that opponent left
                io.to(currentRoom).emit('opponentLeft');
            }
        }
    });
});

server.listen(3000, '0.0.0.0');