// ----- COMMON DEPENDENCIES -----
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const cors = require('cors');

// Internal imports
const { addUser, removeUser, getUser, getUsersInRoom } = require('./users');
const router = require('./router');

// ----- EXPRESS APP AND HTTP SERVER -----
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(router);

// ----- SOCKET.IO SERVER -----
const io = socketio(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
  },
});

// --------- Global variables for Editor ---------
let editorUsers = {};        // All connected editor users
let editorContent = '';       // Current content of editor
let editorActivity = [];     // Activity log

// ----- SOCKET.IO HANDLING -----
io.on('connection', (socket) => {
  console.log('User Connected (Socket.IO)');

  // ----------------- Chat functionality -----------------
  socket.on('join', ({ name, room }, callback) => {
    const { error, user } = addUser({ id: socket.id, name, room });

    if (error) return callback(error);

    socket.join(user.room);

    socket.emit('message', { user: 'admin', text: `${user.name}, welcome to room ${user.room}.` });
    socket.broadcast.to(user.room).emit('message', { user: 'admin', text: `${user.name} has joined!` });

    io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room) });

    callback();
  });

  socket.on('sendMessage', (message, callback) => {
    const user = getUser(socket.id);
    if (user) {
      io.to(user.room).emit('message', { user: user.name, text: message });
    }
    callback();
  });

  // ----------------- Whiteboard functionality -----------------
  socket.on('canvas-data', (data) => {
    socket.broadcast.emit('canvas-data', data);
  });

  // ----------------- Editor functionality -----------------
  const typesDef = {
    USER_EVENT: 'userEvent',
    CONTENT_CHANGE: 'contentChange',
  };

  socket.on(typesDef.USER_EVENT, ({ username }) => {
    editorUsers[socket.id] = { username };
    editorActivity.push(`${username} joined the document`);

    io.emit(typesDef.USER_EVENT, {
      users: editorUsers,
      userActivity: editorActivity
    });

    // Send current content to newly joined user
    socket.emit(typesDef.CONTENT_CHANGE, {
      editorContent,
      userActivity: editorActivity
    });
  });

  socket.on(typesDef.CONTENT_CHANGE, ({ content }) => {
    editorContent = content;

    io.emit(typesDef.CONTENT_CHANGE, {
      editorContent,
      userActivity: editorActivity
    });
  });

  // ----------------- Handle disconnect -----------------
  socket.on('disconnect', () => {
    console.log('User Disconnected (Socket.IO)');

    // Chat: remove user
    const user = removeUser(socket.id);
    if (user) {
      io.to(user.room).emit('message', { user: 'Admin', text: `${user.name} has left.` });
      io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room) });
    }

    // Editor: remove user
    const username = editorUsers?.[socket.id]?.username || 'Unknown user';
    if (editorUsers[socket.id]) {
      editorActivity.push(`${username} left the document`);
      delete editorUsers[socket.id];

      io.emit(typesDef.USER_EVENT, {
        users: editorUsers,
        userActivity: editorActivity
      });
    }
  });
});

// ----- SERVER LISTEN -----
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT} (HTTP + Socket.IO)`);
});
