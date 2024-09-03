import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import NodeCache from 'node-cache';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const cache = new NodeCache();
const roomCacheKey = 'rooms';
const messageCacheKey = 'messages';
const userCooldownKey = 'userCooldown';
const userRateLimitKey = 'userRateLimit';

const maxRoomsAllowed = 35;
const ROOM_INACTIVITY_THRESHOLD = 3600000; // 1 hour
const MESSAGE_RATE_LIMIT_MS = 5000; // 5 seconds
const MAX_MESSAGES_PER_PERIOD = 7; // 10 messages per MESSAGE_RATE_LIMIT_MS
const MAX_MESSAGE_LENGTH = 400; // maximum message length

const generate_uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random() * 16 | 0 : (Math.random() * 16 | 0) & 3 | 8).toString(16));

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

            const rooms = cache.get(roomCacheKey) || {};
            const totalRoomsActive = Object.keys(rooms).length;

            if (totalRoomsActive >= maxRoomsAllowed) {
                socket.emit('error', {
                    message: 'There are currently too many rooms active. Please try again later.',
                    type: 'system'
                });
                return;
            }

            rooms[room_id] = {
                created: Date.now(),
                lastActivity: Date.now(),
                users: new Set(),
                creator: user_id
            };

            cache.set(roomCacheKey, rooms);
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

                const messages = cache.get(messageCacheKey) || {};
                socket.emit('previousMessages', messages[room] || []);

                isRoomCreator = rooms[room].creator === userId;
                socket.emit('roomJoined', room_id, isRoomCreator, rooms[room].users.size);
                updateRoomUsersCount(rooms, room_id);

                console.log(`[${ip}]: Connected to room: ${room}`);
            } else {
                socket.emit('error', {
                    message: 'Invalid Room ID',
                    type: 'system'
                });
            }
        });

        socket.on('deleteRoom', (roomId, userId) => {
            const rooms = cache.get(roomCacheKey) || {};
            if (roomId && rooms[roomId]) {
                if (rooms[roomId].creator === userId) {
                    io.to(roomId).emit('roomDeleted', { message: 'The room has been deleted.' });

                    cache.del(roomId);
                    cache.del(messageCacheKey, roomId);

                    console.log(`[${ip}]: Room deleted: ${roomId}`);
                } else {
                    socket.emit('error', { message: `Only the room creator can delete this room.`, type: 'system' });
                }
            } else {
                socket.emit('error', { message: `Couldn't delete the room. Invalid Room ID`, type: 'system' });
            }
        });

        socket.on('chat message', (message) => {
            const now = Date.now();
            const userId = socket.id;

            // Rate Limiting Check
            let userRateLimit = cache.get(userRateLimitKey) || {};

            if (!userRateLimit[userId]) {
                userRateLimit[userId] = [];
            }

            // Filter out timestamps older than the rate limit
            userRateLimit[userId] = userRateLimit[userId].filter(timestamp => now - timestamp < MESSAGE_RATE_LIMIT_MS);

            if (userRateLimit[userId].length >= MAX_MESSAGES_PER_PERIOD) {
                let userCooldown = cache.get(userCooldownKey) || {};
                userCooldown[userId] = now;
                cache.set(userCooldownKey, userCooldown);

                socket.emit('error', { message: 'Too many messages. Please wait a moment before sending more.', COOLDOWN_MS: MESSAGE_RATE_LIMIT_MS, type: 'cooldown' });
                return;
            }

            // Add the current timestamp to the user's message history
            userRateLimit[userId].push(now);
            cache.set(userRateLimitKey, userRateLimit);

            if (message.text.trim().length > MAX_MESSAGE_LENGTH) {
                socket.emit('error', {
                    message: `Message is too long. Maximum length is ${MAX_MESSAGE_LENGTH} characters.`,
                    type: 'msg_length_limit',
                    COOLDOWN_MS: 1200
                });
                return;
            }

            // Process message
            if (room_id) {
                const timestampedMessage = { ...message, timestamp: new Date().toISOString() };
                io.to(room_id).emit('message', timestampedMessage);

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
                    setTimeout(() => {
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