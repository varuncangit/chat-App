const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const formatMessage = require('./src/messages');
const { userJoin, getCurrentUser, userLeave, getRoomUsers } = require('./src/users');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/chatApp', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Define MongoDB Schema for messages
const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  time: String,
  room: String
});

// Create MongoDB Model
const Message = mongoose.model('Message', messageSchema);

const botName = 'ChatApp bot';
// Run when user connects
io.on('connection', socket => {
  // console.log('new connection');

  socket.on('joinRoom', async ({ username, room }) => {
    const user = userJoin(socket.id, username, room);

    socket.join(user.room);

    // welcome for current user
    socket.emit('message', formatMessage(botName, 'Welcome to Chat-App'));

    // broadcast when new user connects
    socket.broadcast.to(user.room)
      .emit('message', formatMessage(botName, `${user.username} has joined the chat`));

    // Fetch chat history for the room from MongoDB
    try {
      const chatHistory = await Message.find({ room: user.room });
      chatHistory.forEach(message => {
        socket.emit('message', formatMessage(message.username, message.text, message.time));
      });
    } catch (err) {
      console.error('Error fetching chat history:', err);
    }
  });

  // Listen for chatMessage
  socket.on('chatMessage', async (msg) => {
    const user = getCurrentUser(socket.id);

    // Save message to MongoDB
    const message = new Message({
      username: user.username,
      text: msg,
      time: formatMessage(user.username, msg).time,
      room: user.room
    });
    try {
      await message.save();
    } catch (err) {
      console.error('Error saving message to MongoDB:', err);
    }

    io.to(user.room).emit('message', formatMessage(user.username, msg));
  });

  // when user disconnects
  socket.on('disconnect', () => {
    const user = userLeave(socket.id);

    if (user) {
      io.to(user.room).emit('message', formatMessage(botName, `${user.username} has left the chat`));
    }
  });
});

// Define route to serve chat.html
app.get('/chat.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server is up and running on port ${PORT}`));
