const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const Message = require("./model/message");
const User = require("./model/user");
const router = require("./router/user");
const postRoute = require("./router/post");
const adminRoute = require("./router/admin");
const notification = require("./controller/notificationController");
const Notification = require("./model/notification");
const messageController = require("./controller/messageController");
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000"],
    methods: ["POST", "PUT", "GET", "DELETE", "PATCH"],
  },
});

global.connectedUsers = new Map();
const onlineUsers = new Map();

io.on("connection", async (socket) => {
  socket.on("joinRoom", ({ chatroom }) => {
    socket.join(chatroom);
  });

  socket.on("user-online", (userId) => {
    onlineUsers.set(userId, socket.id);
    io.emit("online-users", Array.from(onlineUsers.keys()));
  });

  socket.on(
    "sendMessage",
    async ({ chatroom, sender, message, replyTo, media, type, sharedPost }) => {
      try {
        if (!sender || !mongoose.Types.ObjectId.isValid(sender)) {
          return;
        }

        const senderUser = await User.findById(sender).select("name profile");
        if (!senderUser) {
          return;
        }
        const newMessage = new Message({
          chatroom,
          sender,
          message,
          replyTo,
          media,
          type: type || "text",
          sharedPost: type === "shared_post" ? sharedPost : null,
        });
        await newMessage.save();
        io.to(chatroom).emit("receiveMessage", {
          _id: newMessage._id,
          status: "sent",
          sender: {
            _id: senderUser._id,
            name: senderUser.name,
            profile: senderUser.profile,
          },
          message: newMessage.message,
          timestamp: newMessage.timestamp,
          replyTo: replyTo || null,
          media: newMessage.media || null,
          type,
          sharedPost: newMessage.sharedPost || null,
        });
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  );

  socket.on("reactMessage", async ({ messageId, userId, emoji }) => {
    const message = await Message.findById(messageId);

    message.reactions = message.reactions.filter(
      (r) => r.user.toString() !== userId
    );

    message.reactions.push({ user: userId, emoji });

    await message.save();

    const updatedMessage = await Message.findById(messageId).populate(
      "reactions.user",
      "name profile"
    );

    io.to(updatedMessage.chatroom).emit("messageReaction", {
      messageId,
      reactions: updatedMessage.reactions,
    });
  });

  socket.on("messageSeen", async ({ messageIds, viewerId }) => {
    try {
      await Message.updateMany(
        { _id: { $in: messageIds } },
        { $set: { status: "seen" } }
      );

      for (let messageId of messageIds) {
        const msg = await Message.findById(messageId);
        if (msg && msg.sender.toString() !== viewerId) {
          const senderSocketId = onlineUsers.get(msg.sender.toString());
          if (senderSocketId) {
            io.to(senderSocketId).emit("messageSeen", {
              viewerId,
              messageIds,
            });
          }
        }
      }
    } catch (err) {
      console.error("Error updating seen messages", err);
    }
  });

  socket.on("removeReaction", async ({ messageId, userId }) => {
    const message = await Message.findById(messageId);
    if (message) {
      message.reactions = message.reactions.filter(
        (r) => r.user.toString() !== userId.toString()
      );

      await message.save();

      io.to(message.chatroom).emit("messageReaction", {
        messageId,
        reactions: message.reactions,
      });
    }
  });

  socket.on("typing", ({ chatroom, sender, receiver }) => {
    socket.to(chatroom).emit("typing", { sender });
  });

  socket.on("deleteMessage", async ({ chatroom, messageId }) => {
    io.to(chatroom).emit("deleteMessage", messageId);
  });

  socket.on("register", async (userId) => {
    global.connectedUsers.set(userId, socket.id);

    socket.on("fetchNotifications", async (userId) => {
      try {
        const notifications = await Notification.find({
          userId,
          isRead: false,
        }).sort({ createdAt: -1 });
        socket.emit("notifications", { type: "bulk", data: notifications });
      } catch (error) {
        console.error(" Error fetching notifications:", error);
      }
    });
    try {
      const unreadNotifications = await Notification.find({
        userId,
        isRead: false,
      });

      if (unreadNotifications.length > 0) {
        io.to(socket.id).emit("notifications", {
          type: "bulk",
          data: unreadNotifications,
        });
      }
    } catch (error) {
      console.error(" Error fetching unread notifications : ", error);
    }
  });

  socket.on("disconnect", () => {
    for (let [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit("online-users", Array.from(onlineUsers.keys()));
  });
});
app.use(
  cors({
    origin: ["http://localhost:3000"],
    methods: ["POST", "PUT", "GET", "DELETE", "PATCH"],
  })
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "images")));

app.use(router);
app.use(postRoute);
app.use(adminRoute);
app.use(notification);
app.use("/messages", messageController);

app.set("socketio", io);

mongoose
  .connect(
    "mongodb+srv://mansigajera2512:h8KYuSDiqjeF4YTE@cluster0.gwch9.mongodb.net/practice?retryWrites=true&w=majority&appName=Cluster0"
  )
  .then(() => {
    server.listen(8000);
  })
  .catch((err) => console.log("Database connection error:", err));

module.exports = { io };
