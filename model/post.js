const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  image: { type: String, required: true, default: null },
  moreImage: [{ type: String }],
  description: { type: String, required: true },
  country: { type: String, required: true },
  category: { type: String, required: true },
  hashtags: [{ type: String }],
  experienceImages: [
    {
      imageUrl: { type: String, required: true },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
  review: [
    {
      comment: { type: String, required: true },
      rating: { type: Number, required: true, min: 1, max: 5 },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      createdAt: { type: Date, default: Date.now },
    },
  ],
  reports: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      reason: { type: String, required: true },
      reportedAt: { type: Date, default: Date.now },
    },
  ],
  isFlagged: { type: Boolean, default: false, required: true },
  isArchive: { type: Boolean, default: false, required: true },
});

module.exports = mongoose.model("Post", postSchema);
