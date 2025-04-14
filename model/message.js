const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chatroom: {
      type: String,
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    message: {
      type: String,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    status: {
      type: String,
      enum: ["sent", "seen"],
      default: "sent",
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    reactions: [
      {
        emoji: String,
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    hiddenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    media: {
      url: {
        type: String,
      },
      type: {
        type: String,
        enum: ["image", "video"],
      },
    },
    sharedPost: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    type: {
      type: String,
      enum: ["text", "media", "shared_post"],
      default: "text",
    },
  },
  { timestamps: true }
);
module.exports = mongoose.model("Message", messageSchema);
