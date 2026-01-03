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
    socket.on('joinRoom', (roomName) => {
        if (!rooms[roomName]) {
            rooms[roomName] = { 
                players: [], 
                map: generateMap(),
                activeItems: {} // Track items by ID
            };

            // ITEM SPAWNER: Runs every 10 seconds
            setInterval(() => {
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
            const side = rooms[roomName].players.length === 1 ? 'left' : 'right';
            socket.emit('init', { side, roomName, map: rooms[roomName].map });
            if (rooms[roomName].players.length === 2) io.to(roomName).emit('startGame');
        }
    });

    socket.on('sync', (data) => {
        if (data.action === 'itemPickup' && rooms[data.room]) {
            delete rooms[data.room].activeItems[data.id];
        }
        socket.to(data.room).emit('opponentSync', data);
    });
});

server.listen(3000, '0.0.0.0');