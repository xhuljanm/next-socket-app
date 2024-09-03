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
const ipRoomCacheKey = 'ipRoomMap';

const maxRoomsAllowed = 35;
const ROOM_INACTIVITY_THRESHOLD = 3600000; // 1 hour
const MESSAGE_RATE_LIMIT_MS = 5000; // 5 seconds
const MAX_MESSAGES_PER_PERIOD = 7; // 10 messages per MESSAGE_RATE_LIMIT_MS
const MAX_MESSAGE_LENGTH = 400; // maximum message length

const generate_uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random() * 16 | 0 : (Math.random() * 16 | 0) & 3 | 8).toString(16));

const removeIpFromRoomMap = (ip, roomId) => {
    const ipRoomMap = cache.get(ipRoomCacheKey) || {};
    if (ipRoomMap[ip]) {
        ipRoomMap[ip] = ipRoomMap[ip].filter(room => room !== roomId);
        if (ipRoomMap[ip].length === 0) {
            delete ipRoomMap[ip];
        }
        cache.set(ipRoomCacheKey, ipRoomMap);
    }
};

const updateRoomUsersCount = (rooms, room_id, io) => io.to(room_id).emit('usersOnline', (rooms[room_id].users || []).length);

const getRoomData = () => cache.get(roomCacheKey) || {};
const getMessageData = () => cache.get(messageCacheKey) || {};
const getUserRateLimit = () => cache.get(userRateLimitKey) || {};
const getUserCooldown = () => cache.get(userCooldownKey) || {};
const getIpRoomMap = () => cache.get(ipRoomCacheKey) || {};

const setRoomData = (rooms) => cache.set(roomCacheKey, rooms);
const setMessageData = (messages) => cache.set(messageCacheKey, messages);
const setUserRateLimit = (userRateLimit) => cache.set(userRateLimitKey, userRateLimit);
const setUserCooldown = (userCooldown) => cache.set(userCooldownKey, userCooldown);
const setIpRoomMap = (ipRoomMap) => cache.set(ipRoomCacheKey, ipRoomMap);

app.prepare().then(() => {
    const httpServer = createServer(handler);
    const io = new Server(httpServer);

    io.on('connection', (socket) => {
        const ip = socket.handshake.address;
        let room_id = null;
        let user_id = null;
        let isRoomCreator = false;

        socket.on('createRoom', (userId) => {
            user_id = userId;
            room_id = generate_uuid();

            const rooms = getRoomData();
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
                users: [],
                creator: user_id
            };

            setRoomData(rooms);

            rooms[room_id].users.push(socket.id);
            setRoomData(rooms);
            socket.emit('roomCreated', room_id);
            console.log(`[${ip}]: Room created: ${room_id}`);
        });

        socket.on('joinRoom', (room, userId) => {
            const rooms = getRoomData();
            const ipRoomMap = getIpRoomMap();

            if (rooms[room]) {
                room_id = room;

                console.log(ipRoomMap, ipRoomMap[ip], room_id);
                if (ipRoomMap[ip] && ipRoomMap[ip].includes(room_id)) {
                    socket.emit('error', {
                        message: 'Your IP address is already in this room.',
                        type: 'system'
                    });
                    return;
                }

                socket.join(room_id);
                rooms[room_id].users.push(socket.id);
                rooms[room_id].lastActivity = Date.now();
                setRoomData(rooms);

                if (!ipRoomMap[ip]) ipRoomMap[ip] = [];
                ipRoomMap[ip].push(room_id);
                setIpRoomMap(ipRoomMap);

                const messages = getMessageData();
                socket.emit('previousMessages', messages[room] || []);

                isRoomCreator = rooms[room].creator === userId;
                socket.emit('roomJoined', room_id, isRoomCreator, rooms[room].users.length);
                updateRoomUsersCount(rooms, room_id, io);

                console.log(`[${ip}]: Connected to room: ${room}`);
            } else {
                socket.emit('error', {
                    message: 'Invalid Room ID',
                    type: 'system'
                });
            }
        });

        socket.on('deleteRoom', (roomId, userId) => {
            const rooms = getRoomData();
            if (roomId && rooms[roomId]) {
                if (rooms[roomId].creator === userId) {
                    io.to(roomId).emit('roomDeleted', { message: 'The room has been deleted.' });

                    setRoomData({});
                    setMessageData({});

                    const ipRoomMap = getIpRoomMap();
                    for (const ip in ipRoomMap) removeIpFromRoomMap(ip, roomId);

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

            let userRateLimit = getUserRateLimit();
            if (!userRateLimit[userId]) userRateLimit[userId] = [];

            userRateLimit[userId] = userRateLimit[userId].filter(timestamp => now - timestamp < MESSAGE_RATE_LIMIT_MS);

            if (userRateLimit[userId].length >= MAX_MESSAGES_PER_PERIOD) {
                let userCooldown = getUserCooldown();
                userCooldown[userId] = now;
                setUserCooldown(userCooldown);

                socket.emit('error', { message: 'Too many messages. Please wait a moment before sending more.', COOLDOWN_MS: MESSAGE_RATE_LIMIT_MS, type: 'cooldown' });
                return;
            }

            userRateLimit[userId].push(now);
            setUserRateLimit(userRateLimit);

            if (message.text.trim().length > MAX_MESSAGE_LENGTH) {
                socket.emit('error', {
                    message: `Message is too long. Maximum length is ${MAX_MESSAGE_LENGTH} characters.`,
                    type: 'msg_length_limit',
                    COOLDOWN_MS: 1200
                });
                return;
            }

            if (room_id) {
                const timestampedMessage = { ...message, timestamp: new Date().toISOString() };
                io.to(room_id).emit('message', timestampedMessage);

                const messages = getMessageData();
                if (!messages[room_id]) messages[room_id] = [];
                messages[room_id].push(timestampedMessage);
                setMessageData(messages);
            }
        });

        socket.on('disconnect', () => {
            const rooms = getRoomData();
            if (room_id && rooms[room_id]) {
                rooms[room_id].users = rooms[room_id].users.filter(id => id !== socket.id);
                updateRoomUsersCount(rooms, room_id, io);
                const ipRoomMap = getIpRoomMap();

                for (const ip in ipRoomMap) removeIpFromRoomMap(ip, room_id);

                console.log(`[${ip}]: Disconnected from room: ${room_id}`);

                if (rooms[room_id].users.length === 0) {
                    setTimeout(() => {
                        const updatedRooms = getRoomData();
                        if (updatedRooms[room_id] && updatedRooms[room_id].users.length === 0) {
                            console.log(`[${ip}]: Room inactive for 1 hour, deleting: ${room_id}`);
                            setRoomData({});
                            setMessageData({});
                            const ipRoomMap = getIpRoomMap();
                            for (const ip in ipRoomMap) removeIpFromRoomMap(ip, room_id);
                        }
                    }, ROOM_INACTIVITY_THRESHOLD);
                }

                rooms[room_id].lastActivity = Date.now();
                setRoomData(rooms);
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