const Notification = require("./model/notification");
const { getOnlineUsers } = require("./socketManager");

async function watchNotifications(io) {
  try {
    const changeStream = Notification.watch();

    changeStream.on("change", async (change) => {
      if (change.operationType === "insert") {
        const newNotification = change.fullDocument;

        const onlineUsers = getOnlineUsers();
        const socketId = onlineUsers.get(newNotification.userId.toString());

        if (socketId) {
          io.to(socketId).emit("new_notification", {
            message: newNotification.message,
            postId: newNotification.postId,
          });

          await Notification.findByIdAndUpdate(newNotification._id, {
            isRead: true,
          });
        }
      }
    });
  } catch (error) {
    console.error(" Error watching notifications:", error);
  }
}

module.exports = { watchNotifications };
