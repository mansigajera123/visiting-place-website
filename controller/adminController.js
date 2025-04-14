const Admin = require("../model/admin");
const User = require("../model/user");
const Post = require("../model/post");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.login = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const admin = await Admin.findOne({ email });

    if (!admin) {
      res.status(401).json({ message: "admin not found" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (isMatch) {
      const token = jwt.sign(
        { adminId: admin._id },
        "secretsecretsupersecret",
        {
          expiresIn: "5h",
        }
      );
      res.status(201).json({ admin, token, message: "login successful" });
    } else {
      res.status(401).json({ message: "error" });
    }
  } catch (err) {
    res.status(500).json({ message: "error" });
  }
};

exports.getUser = async (req, res, next) => {
  const searchQuery = req.query.search || "";

  let query = {
    $or: [
      { name: { $regex: searchQuery, $options: "i" } },
      { email: { $regex: searchQuery, $options: "i" } },
    ],
  };

  try {
    const user = await User.find(query)
      .populate("favourite", "title")
      .populate("follow", "name");
    await res.json(user);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.getPost = async (req, res, next) => {
  const searchQuery = req.query.search || "";

  let query = {
    $or: [
      { title: { $regex: searchQuery, $options: "i" } },
      { description: { $regex: searchQuery, $options: "i" } },
      { country: { $regex: searchQuery, $options: "i" } },
      { category: { $regex: searchQuery, $options: "i" } },
    ],
  };

  try {
    const post = await Post.find(query).populate("userId", "email name");
    res.json(post);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.dashboard = async (req, res, next) => {
  try {
    const user = await User.find();
    const post = await Post.find();
    const admin = await Admin.find();
    let review = 0;
    post.map((posts) => {
      review += posts.review.length;
    });
    res.json({ user, post, review, admin });
  } catch (err) {
    res.status(500).json("error occured");
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

exports.deleteUser = async (req, res, next) => {
  const userId = req.params.id;
  try {
    const user = await User.findByIdAndDelete(userId);

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.editPost = async (req, res, next) => {
  const postId = req.params.id;
  const { title, description, country, category } = req.body;
  try {
    const post = await Post.findByIdAndUpdate(
      postId,
      { title, image: req.file.path, country, category, description },
      { new: true }
    );

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.editUser = async (req, res, next) => {
  const userId = req.params.id;
  const { email, password, name, mobile } = req.body;

  const user = await User.findById(userId);
  let hashedPassword;
  if (password === user.password) {
    hashedPassword = password;
  } else {
    hashedPassword = await bcrypt.hash(password, 10);
  }
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        email: email,
        password: hashedPassword,
        name: name,
        mobile: mobile,
        profile: req.file.path,
      },
      { new: true }
    );

    await user.save();
    res.status(201).json({ message: "signup successfull" });
  } catch (err) {
    res.status(500).json({ message: "Invalid Input" });
  }
};

exports.viewProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    res.json(user);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.getAllReviews = async (req, res) => {
  const searchQuery = req.query.search || "";

  let query = {
    $or: [
      { "review.comment": { $regex: searchQuery, $options: "i" } },
      { title: { $regex: searchQuery, $options: "i" } },
    ],
  };

  try {
    const posts = await Post.find(query).populate(
      "review.userId",
      "name email"
    );

    if (!posts || posts.length === 0) {
      return res.status(404).json({ message: "No posts found" });
    }

    const reviews = posts.flatMap((post) =>
      post.review
        .filter((review) => review.userId)
        .map((review) => ({
          postId: post._id,
          postTitle: post.title,
          reviewId: review._id,
          comment: review.comment,
          rating: review.rating,
          userId: review.userId?._id || null,
          username: review.userId.name || "Unknown User",
          userEmail: review.userId.email || "No Email",
        }))
    );

    res.status(200).json(reviews);
  } catch (error) {
    console.error("Error fetching reviews :", error);
    res.status(500).json({ message: error.message });
  }
};

exports.deleteReview = async (req, res) => {
  const { id, reviewId } = req.params;

  try {
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    post.review = post.review.filter(
      (review) => review._id.toString() !== reviewId
    );

    await post.save();
    res
      .status(200)
      .json({ message: "Review deleted successfully", review: post.review });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.AddPeople = async (req, res, next) => {
  const { email, password, name, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    if (role === "Admin") {
      const admin = new Admin({
        email,
        password: hashedPassword,
        name: name,
        profile: req.file.path,
      });
      await admin.save();
      res.status(201).json({ message: "Add Successfully" });
    }
    if (role === "User") {
      const user = new User({
        email,
        password: hashedPassword,
        name: name,
        profile: req.file.path,
      });
      await user.save();
      res.status(201).json({ message: "Add Successfully" });
    }
  } catch (err) {
    res.status(500).json({ message: "Invalid Input" });
  }
};

exports.viewAdmin = async (req, res, next) => {
  const adminId = req.user.adminId;
  try {
    const admin = await Admin.findById(adminId);
    await res.json(admin);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.allAdmin = async (req, res, next) => {
  const searchQuery = req.query.search || "";

  let query = {
    $or: [
      { name: { $regex: searchQuery, $options: "i" } },
      { email: { $regex: searchQuery, $options: "i" } },
    ],
  };
  try {
    const admin = await Admin.find(query);
    await res.json(admin);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

