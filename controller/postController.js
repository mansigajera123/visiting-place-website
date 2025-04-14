const Post = require("../model/post");
const Comment = require("../model/comment");
const User = require("../model/user");
const PDFDocument = require("pdfkit");
const Notification = require("../model/notification");

exports.addPost = async (req, res) => {
  try {
    const io = req.app.get("socketio");

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    const { title, description, country, category, hashtags } = req.body;
    const imagePath = req.file ? req.file.path : null;

    if (!imagePath) {
      return res.status(400).json({ error: "Image file is required" });
    }

    const post = new Post({
      title,
      image: imagePath,
      description,
      country,
      category,
      hashtags: hashtags ? hashtags.split(",") : [],
      userId: req.user.userId,
    });
    await post.save();

    const user = await User.findById(req.user.userId).populate("follow");

    if (user && user.follow.length > 0) {
      const notifications = user.follow.map((follower) => ({
        senderId: req.user.userId,
        userId: follower._id,
        message: `${user.name} added a new post!`,
        postId: post._id,
        read: false,
      }));

      const savedNotifications = await Notification.insertMany(notifications);

      user.follow.forEach((follower, index) => {
        const followerSocketId = global.connectedUsers.get(
          follower._id.toString()
        );

        if (followerSocketId) {
          io.to(followerSocketId).emit("notifications", {
            type: "single",
            data: savedNotifications[index],
          });
        }
      });
    }

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.viewPost = async (req, res, next) => {
  try {
    const post = await Post.find({ userId: req.user.userId })
      .find({
        isFlagged: false,
      })
      .find({ isArchive: false });
    res.json(post);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.getpost = async (req, res, next) => {
  try {
    const post = await Post.find();
    res.json({ post });
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.getAllPost = async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 6;
  const skip = (page - 1) * limit;
  const searchQuery = req.query.search || "";
  const categoryQuery = req.query.category || "";
  const placeQuery = req.query.place || "";

  try {
    const currentUser = await User.findById(req.user.userId).select("block");
    const blockedUserIds = currentUser?.block || [];

    const usersBlockingMe = await User.find({ block: req.user.userId }).select(
      "_id"
    );
    const blockedByOthers = usersBlockingMe.map((u) => u._id.toString());

    let query = {
      $and: [
        {
          $or: [
            { title: { $regex: searchQuery, $options: "i" } },
            { description: { $regex: searchQuery, $options: "i" } },
            { country: { $regex: searchQuery, $options: "i" } },
            { category: { $regex: searchQuery, $options: "i" } },
          ],
        },
        { userId: { $nin: [...blockedUserIds, ...blockedByOthers] } },
        { isFlagged: false },
      ],
    };

    if (categoryQuery) {
      query.country = categoryQuery;
    }

    if (placeQuery) {
      query.category = placeQuery;
    }

    const post = await Post.find(query)
      .find({ isArchive: false })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name profile");

    const totalPost = await Post.countDocuments(query);
    const totalPages = Math.ceil(totalPost / limit);

    const countryImages = await Post.aggregate([
      {
        $group: {
          _id: "$country",
          image: { $first: "$image" },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const category = await Post.distinct("category");

    res.status(200).json({
      post,
      totalPost,
      totalPages,
      category,
      curruntPage: page,
      countryImages,
      userId: req.user.userId,
    });
  } catch (err) {
    res.status(500).json("Error occurred");
  }
};

exports.deletePost = async (req, res, next) => {
  const postId = req.params.id;
  try {
    const post = await Post.findByIdAndDelete(postId);

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.editPost = async (req, res) => {
  const postId = req.params.id;
  const { title, description, country, category, hashtags } = req.body;

  try {
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const newMainImage = req.files.image ? req.files.image[0].path : post.image;

    const newMoreImages = req.files.moreImage
      ? req.files.moreImage.map((file) => file.path)
      : [];

    post.title = title;
    post.description = description;
    post.country = country;
    post.category = category;
    post.image = newMainImage;
    post.moreImage = [...post.moreImage, ...newMoreImages];
    post.hashtags = JSON.parse(hashtags);

    await post.save();

    res.status(200).json(post);
  } catch (err) {
    res
      .status(500)
      .json({ error: "An error occurred while updating the post" });
  }
};

exports.detailView = async (req, res, next) => {
  const postId = req.params.id;
  try {
    const post = await Post.findById(postId)
      .populate("userId", "name email profile")
      .populate("experienceImages.userId", "name profile");

    const post2 = await Post.find({ country: post.country }).populate(
      "userId",
      "name email profile"
    );
    const updatedPost = post2.filter((post) => post._id.toString() !== postId);

    res.json({
      post,
      name: post.userId.name,
      userId: req.user.userId,
      suggestedPost: updatedPost || null,
    });
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.addToFavourite = async (req, res, next) => {
  try {
    const io = req.app.get("socketio");
    const user = await User.findById(req.user.userId);
    const postId = req.params.id;
    const post = await Post.findById(postId).populate("userId", "name");

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const postOwnerId = post.userId._id.toString();

    let message = "";
    if (user.favourite.includes(postId)) {
      user.favourite = user.favourite.filter(
        (fav) => fav.toString() !== postId
      );
      message = `${user.name} removed your post from favorites.`;
    } else {
      user.favourite.push(postId);
      message = `${user.name} added your post to favorites.`;

      const notification = new Notification({
        userId: postOwnerId,
        senderId: req.user.userId,
        message,
        read: false,
      });

      await notification.save();

      const targetSocketId = global.connectedUsers.get(postOwnerId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("notifications", {
          type: "single",
          data: notification,
        });
      } else {
        console.log(`User ${postOwnerId} is not connected`);
      }
    }

    await user.save();

    res.json(user.favourite);
  } catch (err) {
    console.error("Error in addToFavourite:", err);
    res.status(500).json({ message: "An error occurred" });
  }
};

exports.viewFavourite = async (req, res, next) => {
  try {
    const post = await Post.find({ isArchive: true });
    const user = await User.findById(req.user.userId)
      // .find({ favourite: { $nin: [...post._id] } })
      .populate("favourite", "title description image country");

    res.json(user.favourite);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.removeFavourite = async (req, res, next) => {
  const postId = req.params.id;

  try {
    const user = await User.findById(req.user.userId);

    if (user.favourite.includes(postId)) {
      user.favourite = user.favourite.filter(
        (fav) => fav.toString() !== postId
      );
    }
    await user.save();
    res.json(user.favourite);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.postReview = async (req, res, next) => {
  const { rating, comment, postid } = req.body;
  try {
    const post = await Post.findById(postid);

    if (!post.review) {
      post.review = [];
    }

    post.review.push({
      rating: rating,
      comment: comment,
      userId: req.user.userId,
    });

    await post.save();

    const updatedPost = await Post.findById(postid).populate(
      "review.userId",
      "name profile"
    );

    res.json(updatedPost.review);
  } catch (err) {
    res.status(500).json({ message: "Error occurred" });
  }
};

exports.getReview = async (req, res, next) => {
  const postId = req.params.id;

  try {
    const post = await Post.findById(postId).populate(
      "review.userId",
      "name email profile"
    );

    res.json(post.review);
  } catch (err) {
    res.status(500).json("Error occurred");
  }
};

exports.getCountryPost = async (req, res, next) => {
  const { country } = req.params;
  const placeQuery = req.query.place || "";
  const currentUser = await User.findById(req.user.userId).select("block");
  const blockedUserIds = currentUser?.block || [];

  const usersBlockingMe = await User.find({ block: req.user.userId }).select(
    "_id"
  );
  const blockedByOthers = usersBlockingMe.map((u) => u._id.toString());

  let query = {
    $and: [{ userId: { $nin: [...blockedUserIds, ...blockedByOthers] } }],
  };

  if (placeQuery) {
    query.category = placeQuery;
  }

  try {
    const post = await Post.find(query)
      .find({ isFlagged: false })
      .find({ country })
      .find({ isArchive: false })
      .populate("image")
      .populate("userId", "name profile");
    const image = post.image;

    const category = await Post.find({ country })
      .find({ isFlagged: false })
      .distinct("category");

    res.json({ post, image, category });
  } catch (err) {
    res.status(500).json({ error: "An error occured" });
  }
};

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
exports.generatePdf = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId).populate(
      "userId",
      "name email profile"
    );

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment filename=${post.title}.pdf`
    );

    doc.pipe(res);

    doc.fontSize(24).text(post.title, { align: "center" }).moveDown();

    doc.fontSize(18).text(`Description : ${post.description}`).moveDown();

    doc.fontSize(18).text(`Country : ${post.country}`).moveDown();

    doc.fontSize(18).text(`Added By : ${post.userId.name}`).moveDown();

    if (post.image) {
      try {
        let imagePath = path.join(__dirname, "..", post.image.trim());

        if (fs.existsSync(imagePath)) {
          const buffer = fs.readFileSync(imagePath);
          const metadata = await sharp(buffer).metadata();

          if (metadata.format !== "jpeg" && metadata.format !== "png") {
            imagePath = await sharp(buffer).toFormat("png").toBuffer();
          }

          doc
            .image(imagePath, {
              fit: [500, 300],
              align: "center",
              valign: "center",
            })
            .moveDown();
        } else {
          console.warn("Image not found:", imagePath);
          doc.fontSize(14).text("Image not available").moveDown();
        }
      } catch (imageError) {
        console.error("Failed to load image:", imageError.message);
        doc.fontSize(14).text("Image not available").moveDown();
      }
    }
    doc.end();
  } catch (err) {
    res.status(500).json({ error: "An error occurred" });
    if (!res.headersSent) {
      res.status(500).json({ error: "An error occurred while generating PDF" });
    }
  }
};
const mongoose = require("mongoose");

exports.sendComment = async (req, res, next) => {
  try {
    const io = req.app.get("socketio");
    const { text } = req.body;
    const { id } = req.params;

    if (!text) {
      return res.status(401).json({ error: "Enter the Comment First" });
    }
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized. User not found." });
    }

    const post = await Post.findById(id).populate("userId", "name");
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    const comment = new Comment({ userId: req.user.userId, text });
    await comment.save();

    post.comments.push(comment._id);
    await post.save();
    const postOwnerId = post.userId._id
      ? post.userId._id.toString()
      : post.userId.toString();

    if (!postOwnerId) {
      console.error("❌ Error: postOwnerId is undefined");
      return res.status(500).json({ error: "Post owner not found." });
    }

    const populatedComment = await comment.populate("userId", "name profile");

    if (postOwnerId !== req.user.userId) {
      const notification = new Notification({
        userId: new mongoose.Types.ObjectId(postOwnerId),
        senderId: req.user.userId,
        message: `${populatedComment.userId.name} commented on your post.`,
        read: false,
      });

      await notification.save();

      const targetSocketId = global.connectedUsers.get(postOwnerId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("notifications", {
          type: "single",
          data: notification,
        });
      }
    }

    res.json({ message: "Comment added", comment: populatedComment });
  } catch (err) {
    console.error("Error in sendComment:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getComments = async (req, res, next) => {
  const { id } = req.params;

  try {
    const post = await Post.findById(id)
      .populate({
        path: "comments",
        populate: {
          path: "userId",
          select: "name profile",
        },
      })
      .lean();

    if (!post) {
      return res.json([]);
    }

    async function populateReplies(comments) {
      return Promise.all(
        comments.map(async (comment) => {
          if (comment.replies && comment.replies.length > 0) {
            comment.replies = await Comment.find({
              _id: { $in: comment.replies },
            })
              .populate("userId", "name profile")
              .lean();

            comment.replies = await populateReplies(comment.replies);
          }
          return comment;
        })
      );
    }

    post.comments = await populateReplies(post.comments);

    res.json(post.comments);
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ error: "An error occurred." });
  }
};

exports.replyToComment = async (req, res, next) => {
  try {
    const io = req.app.get("socketio");
    const { text } = req.body;
    const { commentId } = req.params;

    if (!text) {
      return res.status(401).json({ error: "Enter the Reply First" });
    }
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized. User not found." });
    }

    const parentComment = await Comment.findById(commentId).populate(
      "userId",
      "name"
    );

    if (!parentComment) {
      return res.status(404).json({ error: "Comment not found." });
    }

    const reply = new Comment({ userId: req.user.userId, text });
    await reply.save();

    parentComment.replies.push(reply._id);
    await parentComment.save();

    const populatedReply = await reply.populate("userId", "name profile");

    const originalCommenterId = parentComment.userId._id.toString();
    if (originalCommenterId !== req.user.userId) {
      const notification = new Notification({
        userId: originalCommenterId,
        senderId: req.user.userId,
        message: `${populatedReply.userId.name} replied to your comment.`,
        read: false,
      });

      await notification.save();

      const targetSocketId = global.connectedUsers.get(originalCommenterId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("notifications", {
          type: "single",
          data: notification,
        });
      } else {
        console.log(`User ${originalCommenterId} is not connected`);
      }
    }

    res.json({ message: "Reply added", reply: populatedReply });
  } catch (err) {
    console.error("Error in replyToComment:", err);
    res.status(500).json({ error: "An error occurred" });
  }
};

const deleteCommentRecursively = async (commentId) => {
  const comment = await Comment.findById(commentId);
  if (!comment) return;

  for (let replyId of comment.replies) {
    await deleteCommentRecursively(replyId);
  }

  await Comment.updateMany(
    { replies: commentId },
    { $pull: { replies: commentId } }
  );
  await Comment.findByIdAndDelete(commentId);
};

exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    const comment = await Comment.findById(commentId).populate("userId", "_id");
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (comment.userId._id.toString() === userId) {
      await deleteCommentRecursively(commentId);
      return res.json({
        message: "Comment and all replies deleted successfully",
      });
    }

    let topLevelComment = comment;
    while (true) {
      const parentComment = await Comment.findOne({
        replies: topLevelComment._id,
      });
      if (!parentComment) break;
      topLevelComment = parentComment;
    }

    const post = await Post.findOne({ comments: topLevelComment._id }).populate(
      "userId",
      "_id"
    );

    if (post && post.userId._id.toString() === userId) {
      await deleteCommentRecursively(commentId);
      return res.json({
        message: "Reply and its nested replies deleted successfully",
      });
    }

    return res
      .status(403)
      .json({ error: "Unauthorized to delete this comment" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ error: "An error occurred." });
  }
};

exports.getFeed = async (req, res) => {
  try {
    const userId = req.user ? req.user.userId.toString() : null;
    const currentUser = await User.findById(req.user.userId).select("block");
    const blockedUserIds = currentUser?.block || [];

    const usersBlockingMe = await User.find({ block: req.user.userId }).select(
      "_id"
    );
    const blockedByOthers = usersBlockingMe.map((u) => u._id.toString());

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("follow");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let query = {
      $and: [
        { userId: { $in: [...user.follow] } },
        { userId: { $nin: [...blockedUserIds, ...blockedByOthers] } },
      ],
    };

    const posts = await Post.find(query)
      .find({ isFlagged: false })
      .find({ isArchive: false })
      .populate("userId", "name profile")
      .sort({ createdAt: -1 });

    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getTrendingPostsAdvanced = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user.userId).select("block");
    const blockedUserIds = currentUser?.block || [];
    const usersBlockingMe = await User.find({ block: req.user.userId }).select(
      "_id"
    );
    const blockedByOthers = usersBlockingMe.map((u) => u._id.toString());

    const trendingPosts = await Post.aggregate([
      {
        $match: {
          userId: { $nin: [...blockedUserIds, ...blockedByOthers] },
          isFlagged: false,
          isArchive: false,
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "comments",
          foreignField: "_id",
          as: "comments",
        },
      },
      {
        $unwind: {
          path: "$review",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id",
          title: { $first: "$title" },
          image: { $first: "$image" },
          description: { $first: "$description" },
          country: { $first: "$country" },
          category: { $first: "$category" },
          userId: { $first: "$userId" },
          comments: { $first: "$comments" },
          reviewCount: { $sum: 1 },
          avgRating: { $avg: "$review.rating" },
        },
      },
      {
        $addFields: {
          avgRating: { $ifNull: ["$avgRating", 0] },
          commentCount: { $size: { $ifNull: ["$comments", []] } },
        },
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: ["$avgRating", 2] },
              "$commentCount",
              "$reviewCount",
            ],
          },
        },
      },
      { $sort: { trendingScore: -1 } },
      { $limit: 10 },
    ]);

    res.status(200).json(trendingPosts);
  } catch (error) {
    console.error("Error fetching trending posts:", error);
    res.status(500).json({ message: "Error fetching trending posts" });
  }
};

exports.LikeComments = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    const userId = req.user.userId;
    if (comment.likes.includes(userId)) {
      comment.likes = comment.likes.filter((id) => id.toString() !== userId);
    } else {
      comment.likes.push(userId);
    }
    await comment.save();
    res.status(200).json(comment.likes);
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error });
  }
};

exports.getLike = async (req, res, next) => {
  try {
    const likedComments = await Comment.find({ likes: req.user.userId }).select(
      "_id"
    );
    res.json({
      likedComments: likedComments.map((comment) => comment._id),
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching likes", error: err });
  }
};

exports.getCategory = async (req, res, next) => {
  try {
    const categories = await Post.aggregate([
      {
        $group: {
          _id: "$category",
          image: { $first: "$image" },
        },
      },
    ]);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories" });
  }
};

exports.getCategoryPost = async (req, res, next) => {
  try {
    const { category } = req.params;
    let blockedUserIds = [];
    let blockedByOthers = [];

    if (req.user) {
      const currentUser = await User.findById(req.user.userId).select("block");
      blockedUserIds = currentUser?.block || [];

      const usersBlockingMe = await User.find({
        block: req.user.userId,
      }).select("_id");
      blockedByOthers = usersBlockingMe.map((u) => u._id.toString());
    }

    const posts = await Post.find({
      category,
      userId: { $nin: [...blockedUserIds, ...blockedByOthers] },
    })
      .find({ isArchive: false })
      .populate("userId", "name profile");

    res.json(posts);
  } catch (error) {
    console.error("Backend error:", error);
    res.status(500).json({ message: "Error fetching posts" });
  }
};

exports.getSearch = async (req, res) => {
  try {
    const query = req.query.query;
    if (!query) return res.json({ posts: [] });
    const currentUser = await User.findById(req.user.userId).select("block");
    const blockedUserIds = currentUser?.block || [];
    const regexQuery = new RegExp(query, "i");

    const usersBlockingMe = await User.find({
      block: req.user.userId,
    }).select("_id");
    const blockedByOthers = usersBlockingMe.map((u) => u._id.toString());

    const posts = await Post.find({
      $and: [
        {
          $or: [
            { title: { $regex: query, $options: "i" } },
            { country: { $regex: query, $options: "i" } },
            { category: { $regex: query, $options: "i" } },
            { hashtags: { $elemMatch: { $regex: regexQuery } } },
          ],
        },
        { userId: { $nin: [...blockedUserIds, ...blockedByOthers] } },
        { isFlagged: false },
      ],
    })
      .find({ isFlagged: false })
      .limit(10);

    res.json({ posts });
  } catch (error) {
    console.error("Error searching posts:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getHashtag = async (req, res) => {
  const tag = `#${req.params.tag}`;
  const currentUser = await User.findById(req.user.userId).select("block");
  const blockedUserIds = currentUser?.block || [];

  const usersBlockingMe = await User.find({
    block: req.user.userId,
  }).select("_id");
  const blockedByOthers = usersBlockingMe.map((u) => u._id.toString());

  try {
    const posts = await Post.find({
      hashtags: { $regex: tag, $options: "i" },
      userId: { $nin: [...blockedUserIds, ...blockedByOthers] },
    })
      .find({ isArchive: false })
      .find({ isFlagged: false })
      .populate("userId", "name profile");
    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: "Error fetching posts by hashtag", error });
  }
};

exports.uploadExperience = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const post = await Post.findById(id).populate(
      "experienceImages.userId",
      "name profile"
    );
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.experienceImages.push({
      imageUrl: req.file.path,
      userId: userId,
    });

    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getExperience = async (req, res) => {
  const id = req.params.id;
  try {
    const post = await Post.findById(id).populate(
      "experienceImages.userId",
      "name profile"
    );

    res.json(post);
  } catch (error) {
    res.json(error);
  }
};

exports.ReportPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId;

    if (!reason) {
      return res.status(400).json({ message: "Report reason is required" });
    }

    const post = await Post.findById(postId).populate("userId", "name");
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const alreadyReported = post.reports.some((report) =>
      report.userId.equals(userId)
    );
    if (alreadyReported) {
      return res
        .status(400)
        .json({ message: "You have already reported this post" });
    }
    post.reports.push({ userId, reason });

    if (post.reports.length >= 5) {
      post.isFlagged = true;
    }

    const io = req.app.get("socketio");

    const postOwnerId = post.userId._id.toString();

    let message = "";

    const user = await User.findById(userId);

    message = `${user.name} reported your post ${post.title}.`;

    const notification = new Notification({
      userId: postOwnerId,
      senderId: req.user.userId,
      message,
      read: false,
    });

    await notification.save();

    const targetSocketId = global.connectedUsers.get(postOwnerId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("notifications", {
        type: "single",
        data: notification,
      });
    } else {
      console.log(`User ${postOwnerId} is not connected`);
    }

    await post.save();
    res.status(200).json({
      message: "Post reported successfully",
      isFlagged: post.isFlagged,
      reports: post.reports,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.ReportComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId;

    if (!reason) {
      return res.status(400).json({ message: "Report reason is required" });
    }

    const comment = await Comment.findById(commentId).populate(
      "userId",
      "name"
    );
    if (!comment) {
      return res.status(404).json({ message: "comment not found" });
    }

    const alreadyReported = comment.reports.some((report) =>
      report.userId.equals(userId)
    );

    if (alreadyReported) {
      return res
        .status(400)
        .json({ message: "You have already reported this post" });
    }
    comment.reports.push({ userId, reason });

    if (comment.reports.length >= 5) {
      comment.isFlagged = true;
    }

    if (comment.reports.length >= 5) {
      await Comment.findByIdAndDelete(commentId);
      return res
        .status(200)
        .json({ message: "Post has been deleted due to multiple reports" });
    }

    const io = req.app.get("socketio");

    const postOwnerId = comment.userId._id.toString();

    let message = "";

    const user = await User.findById(userId);

    message = `${user.name} reported your comment ${comment.text}.`;

    const notification = new Notification({
      userId: postOwnerId,
      senderId: req.user.userId,
      message,
      read: false,
    });

    await notification.save();

    const targetSocketId = global.connectedUsers.get(postOwnerId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("notifications", {
        type: "single",
        data: notification,
      });
    } else {
      console.log(`User ${postOwnerId} is not connected`);
    }

    await comment.save();
    res.status(200).json({
      message: "comment reported successfully",
      isFlagged: comment.isFlagged,
      reports: comment.reports,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.upvoteReview = async (req, res) => {
  const { postId, reviewId } = req.params;
  const userId = req.user.userId;

  try {
    const post = await Post.findById(postId).populate(
      "review.userId",
      "name profile"
    );
    if (!post) return res.status(404).json({ message: "Post not found" });

    const review = post.review.id(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });

    review.upvotes = review.upvotes || [];
    review.downvotes = review.downvotes || [];

    if (review.downvotes.includes(userId)) {
      review.downvotes.pull(userId);
    }

    if (!review.upvotes.includes(userId)) {
      review.upvotes.push(userId);
    } else {
      review.upvotes.pull(userId);
    }

    await post.save();

    res.status(200).json(review);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.downvoteReview = async (req, res) => {
  const { postId, reviewId } = req.params;
  const userId = req.user.userId;

  try {
    const post = await Post.findById(postId).populate(
      "review.userId",
      "name profile"
    );
    if (!post) return res.status(404).json({ message: "Post not found" });

    const review = post.review.id(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });

    review.upvotes = review.upvotes || [];
    review.downvotes = review.downvotes || [];

    if (review.upvotes.includes(userId)) {
      review.upvotes.pull(userId);
    }

    if (!review.downvotes.includes(userId)) {
      review.downvotes.push(userId);
    } else {
      review.downvotes.pull(userId);
    }

    await post.save();

    res.status(200).json(review);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.makeArchive = async (req, res, next) => {
  const postId = req.params.id;
  try {
    const post = await Post.findById(postId);

    if (post.isArchive) {
      post.isArchive = false;
    } else {
      post.isArchive = true;
    }
    await post.save();
    res.json(post);
  } catch (error) {
    res.error(error);
  }
};

exports.getArchive = async (req, res, next) => {
  try {
    const post = await Post.find({ isArchive: true, userId: req.user.userId });

    res.json(post);
  } catch (error) {
    res.error(error);
  }
};
