import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import NodeCache from 'node-cache';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost'; // Default to 'localhost' if not set
const port = process.env.PORT || 3000; // Default to 3000 if not set

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const cache = new NodeCache();
const roomCacheKey = 'rooms'; // To store room metadata
const messageCacheKey = 'messages'; // To store messages for each room
const maxRoomsAllowed = 35; // Set a room limit

const generate_uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random() * 16 | 0 : (Math.random() * 16 | 0) & 3 | 8).toString(16));

const ROOM_INACTIVITY_THRESHOLD = 3600000; // 1h

app.prepare().then(() => {
    const httpServer = createServer(handler);
    const io = new Server(httpServer);

    io.on('connection', (socket) => {
        const ip = socket.handshake.address;
        let room_id = null;
        let user_id = null;
        let isRoomCreator = false;

        const updateRoomUsersCount = (rooms, room_id) => io.to(room_id).emit('usersOnline', rooms[room_id].users.size);

        socket.on('createRoom', (userId) => {
            user_id = userId;
            room_id = generate_uuid();

            // Add room ID to cache
            const rooms = cache.get(roomCacheKey) || {};
            const totalRoomsActive = Object.keys(rooms).length;

            if (totalRoomsActive >= maxRoomsAllowed) {
                socket.emit('error', {
                    message: 'There are currently too many rooms active. Please try again later.'
                });
                return;
            }

            rooms[room_id] = {
                created: Date.now(),
                lastActivity: Date.now(),
                users: new Set(),
                creator: user_id // Store the creator's user_id
            };

            cache.set(roomCacheKey, rooms);

            // Join the room
            socket.join(room_id, user_id);
            rooms[room_id].users.add(socket.id);
            cache.set(roomCacheKey, rooms);
            socket.emit('roomCreated', room_id);
            console.log(`[${ip}]: Room created: ${room_id}`);
        });

        socket.on('joinRoom', (room, userId) => {
            const rooms = cache.get(roomCacheKey) || {};
            if (rooms[room]) {
                room_id = room;
                socket.join(room_id);
                rooms[room_id].users.add(socket.id);
                rooms[room_id].lastActivity = Date.now();
                cache.set(roomCacheKey, rooms);

                // Send existing messages to the client
                const messages = cache.get(messageCacheKey) || {};
                socket.emit('previousMessages', messages[room] || []);

                if (rooms[room].creator === userId) isRoomCreator = true;
                else isRoomCreator = false;

                socket.emit('roomJoined', room_id, isRoomCreator, rooms[room].users.size);
                updateRoomUsersCount(rooms, room_id);

                console.log(`[${ip}]: Connected to room: ${room}`);
            } else {
                socket.emit('error', {
                    message: 'Invalid Room ID'
                });
            }
        });

        socket.on('deleteRoom', (roomId, userId) => {
            const rooms = cache.get(roomCacheKey) || {};
            if (roomId && rooms[roomId]) {
                if (rooms[roomId].creator === userId) { // Check if the socket ID matches the room creator
                    io.to(roomId).emit('roomDeleted', { message: 'The room has been deleted.' });

                    // Remove the room from cache
                    cache.del(roomId);
                    cache.del(messageCacheKey, roomId);

                    console.log(`[${ip}]: Room deleted: ${roomId}`);
                } else {
                    socket.emit('error', { message: `Only the room creator can delete this room.` });
                }
            } else {
                socket.emit('error', { message: `Couldn't delete the room. Invalid Room ID` });
            }
        });

        socket.on('chat message', (message) => {
            if (room_id) {
                const timestampedMessage = {
                    ...message,
                    timestamp: new Date().toISOString()
                };

                io.to(room_id).emit('message', timestampedMessage);

                // Save message to cache
                const messages = cache.get(messageCacheKey) || {};
                if (!messages[room_id]) messages[room_id] = [];

                messages[room_id].push(timestampedMessage);
                cache.set(messageCacheKey, messages);
            }
        });

        socket.on('disconnect', () => {
            const rooms = cache.get(roomCacheKey) || {};
            if (room_id && rooms[room_id]) {
                rooms[room_id].users.delete(socket.id);
                updateRoomUsersCount(rooms, room_id);
                console.log(`[${ip}]: Disconnected from room: ${room_id}`);

                if (rooms[room_id].users.size === 0) {
                    setTimeout(() => { // Set a timeout to remove the room after 1 hour of inactivity
                        const updatedRooms = cache.get(roomCacheKey) || {};
                        if (updatedRooms[room_id] && updatedRooms[room_id].users.size === 0) {
                            console.log(`[${ip}]: Room inactive for 1 hour, deleting: ${room_id}`);
                            cache.del(roomCacheKey);
                            cache.del(messageCacheKey);
                        }
                    }, ROOM_INACTIVITY_THRESHOLD);
                }

                rooms[room_id].lastActivity = Date.now();
                cache.set(roomCacheKey, rooms);
            }
        });
    });

    httpServer
    .once("error", (err) => {
        console.error(err);
        process.exit(1);
    })
    .listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
});