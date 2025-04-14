const Notification = require("./model/notification");

const onlineUsers = new Map();

function getOnlineUsers() {
  return onlineUsers;
}

function addOnlineUser(userId, socketId) {
  onlineUsers.set(userId.toString(), socketId);
}

function removeOnlineUser(socketId) {
  for (let [userId, id] of onlineUsers) {
    if (id === socketId) {
      onlineUsers.delete(userId);
      break;
    }
  }
}

function setupSocket(io) {
  io.on("connection", (socket) => {
    socket.on("user_online", (userId) => {
      onlineUsers.set(userId, socket.id);
    });

    socket.on("register", async (userId) => {
      if (!userId) return;

      addOnlineUser(userId, socket.id);

      const notifications = await Notification.find({ userId });

      if (notifications.length > 0) {
        notifications.forEach((notification) => {
          io.to(socket.id).emit("new_notification", {
            message: notification.message,
            postId: notification.postId,
          });
        });

        await Notification.updateMany({ userId }, { $set: { isRead: true } });
      }
    });

    socket.on("disconnect", () => {
      removeOnlineUser(socket.id);
    });
  });
}

module.exports = { setupSocket, getOnlineUsers };
