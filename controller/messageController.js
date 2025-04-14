const express = require("express");
const Message = require("../model/message");
const User = require("../model/user");
const authenticate = require("../middleware/auth");
const router = express.Router();
const upload = require("../middleware/upload");

router.get("/unread-counts", authenticate, async (req, res) => {
  const currentUserId = req.user.userId;

  try {
    const messages = await Message.find({
      chatroom: { $regex: new RegExp(`^.*${currentUserId}.*$`) },
      status: "sent",
    });

    const counts = {};

    messages.forEach((msg) => {
      const senderId = msg.sender.toString();
      counts[senderId] = (counts[senderId] || 0) + 1;
    });

    res.json(counts);
  } catch (err) {
    console.error("Unread count error:", err);
    res.status(500).json({ error: "Failed to get unread counts" });
  }
});

router.get("/:sender/:receiver", async (req, res, next) => {
  try {
    const { sender, receiver } = req.params;
    const chatroom = [sender, receiver].sort().join("_");

    const messages = await Message.find({ chatroom, hiddenBy: { $ne: sender } })
      .populate("sender", "name profile")
      .populate("receiver", "name profile")
      .populate({
        path: "replyTo",
        populate: {
          path: "sender",
          select: "name profile",
        },
      })
      .populate("reactions.user", "name profile")
      .sort({ timestamp: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Error fetching messages" });
  }
});

router.get("/:chatroom", async (req, res, next) => {
  try {
    const { chatroom } = req.params;
    const messages = await Message.find({ chatroom })
      .populate("sender", "name profile")
      .populate("reactions.user", "name profile")
      .populate({
        path: "replyTo",
        populate: {
          path: "sender",
          select: "name profile",
        },
      });
    res.json(messages);
  } catch (error) {
    console.error(" Error fetching messages:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const userId = req.user.userId.toString();

    const messages = await Message.find({
      chatroom: { $regex: userId },
      hiddenBy: { $ne: userId },
    })
      .populate("sender", "name email profile")
      .sort({ createdAt: -1 });

    const userMap = new Map();

    for (const msg of messages) {
      const [id1, id2] = msg.chatroom.split("_");
      const otherUserId = userId === id1 ? id2 : id1;

      if (!userMap.has(otherUserId)) {
        let userDetails;

        if (msg.sender && msg.sender._id.toString() === otherUserId) {
          userDetails = msg.sender;
        } else {
          userDetails = await User.findById(otherUserId).select(
            "name email profile"
          );
        }

        if (userDetails) {
          userMap.set(otherUserId, {
            _id: userDetails._id,
            name: userDetails.name,
            email: userDetails.email,
            profile: userDetails.profile,
            lastMessageTime: msg.createdAt,
          });
        }
      }
    }

    const userList = Array.from(userMap.values()).sort(
      (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
    );

    res.json(userList);
  } catch (err) {
    console.error("Error fetching conversations:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

router.delete("/:messageId", async (req, res, next) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: "Message not Found" });

    await Message.findByIdAndDelete(messageId);

    req.app
      .get("socketio")
      .to(message.chatroom)
      .emit("deleteMessage", messageId);

    res.json({ success: true, message: "Message deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error deleting message" });
  }
});

router.delete("/user/:chatUserId", authenticate, async (req, res) => {
  const currentUserId = req.user.userId;
  const chatUserId = req.params.chatUserId;

  const chatroom1 = `${currentUserId}_${chatUserId}`;
  const chatroom2 = `${chatUserId}_${currentUserId}`;

  try {
    await Message.updateMany(
      {
        chatroom: { $in: [chatroom1, chatroom2] },
      },
      {
        $addToSet: { hiddenBy: currentUserId },
      }
    );
    res.json({ message: "Messages hidden for user" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.delete("/:messageId/:chatroom", async (req, res, next) => {
  try {
    const { messageId, chatroom } = req.params;
    await Message.findByIdAndDelete(messageId);

    const io = req.app.get("socketio");
    io.to(chatroom).emit("messageDeleted", messageId);

    res.json({ success: true, message: "Message deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error deleting message" });
  }
});

router.post("/upload", upload.single("media"), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const fileType = file.mimetype.startsWith("video") ? "video" : "image";
  res.json({
    url: `images/${file.filename}`,
    type: fileType,
  });
});

router.post("/:chatrooms", authenticate, async (req, res) => {
  const { chatrooms } = req.params;
  const { senderId, receiverId, message, post, type } = req.body;

  try {
    const senderUser = await User.findById(senderId).select("name profile");

    if (!senderUser) return res.status(404).json({ error: "Sender not found" });

    const newMessage = new Message({
      chatroom: chatrooms,
      sender: senderId,
      receiver: receiverId,
      message,
      type: type || "text",
      sharedPost: type === "shared_post" ? post : null,
    });

    await newMessage.save();

    const io = req.app.get("socketio");
    io.to(chatrooms).emit("receiveMessage", {
      _id: newMessage._id,
      status: "sent",
      sender: {
        _id: senderUser._id,
        name: senderUser.name,
        profile: senderUser.profile,
      },
      message: newMessage.message,
      timestamp: newMessage.timestamp,
      replyTo: null,
      media: null,
      type,
      sharedPost: newMessage.sharedPost || null,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error sharing post:", err);
    res.status(500).json({ error: "Error sharing post" });
  }
});

module.exports = router;
