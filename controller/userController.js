const User = require("../model/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { validationResult } = require("express-validator");
const Post = require("../model/post");
const Notification = require("../model/notification");

exports.signUp = async (req, res, next) => {
  const { email, password, confirmpassword } = req.body;

  try {
    const emailCheck = await User.findOne({ email });

    if (emailCheck) {
      return res.status(401).json({ message: "User Already Exist" });
    }
    if (password !== confirmpassword) {
      return res
        .status(401)
        .json({ message: "Password and Confirmpassword does not match" });
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({
        email,
        password: hashedPassword,
      });

      await user.save();
      res.status(201).json({ message: "signup successfull" });
    }
  } catch (err) {
    res.status(500).json({ message: "Invalid Input" });
  }
};

exports.login = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array()[0].msg });
  }

  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid Password" });
    }
    if (isMatch) {
      const token = jwt.sign({ userId: user._id }, "secretsupersecretsecret", {
        expiresIn: "1h",
      });

      user.token = token;
      user.save();
      res.status(201).json({
        user,
        token,
        message: "login successful",
      });
    } else {
      res.status(401).json({ message: "Error Occured" });
    }
  } catch (err) {
    res.status(500).json({ message: "Error Occured" });
  }
};

exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ message: "user not found" });
    }

    const resetToken = jwt.sign({ userId: user._id }, "resetSecret", {
      expiresIn: "1h",
    });

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      host: "smtp.gmail.com",
      post: 465,
      secure: true,
      auth: {
        user: "mansigajera102@gmail.com",
        pass: "blrv sqmz hmpj thhj",
      },
    });

    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;

    await transporter.sendMail({
      from: "mansigajera102@gmail.com",
      to: email,
      subject: "Password Reset Request",
      html: `<b>Click the following link to reset your password: ${resetUrl}</b>`,
    });

    res.status(201).json({ message: "Link sent successful" });
  } catch (err) {
    res.status(500).json({ message: "error" });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, "resetSecret");
    const userId = decoded.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Error resetting password. Token may be invalid or expired .",
    });
  }
};

exports.profile = async (req, res, next) => {
  const { name, mobile } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        name: name || "",
        mobile: mobile || "",
        profile: req.file.path || "images/profile.png",
      },
      { new: true }
    );
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.viewProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).populate(
      "follow",
      "name profile"
    );
    const post = await Post.find({ userId: req.user.userId }).find({
      isFlagged: false,
    });
    const count = await Post.countDocuments({ userId: req.user.userId });
    const followers = await User.find({ follow: req.user.userId }).select(
      "name profile"
    );
    const Followercount = followers.length;
    res.json({ user, post, count, followers, Followercount });
  } catch (err) {
    res.status(500).json("error occured");
  }
};

exports.countPost = async (req, res, next) => {
  try {
    const count = await Post.countDocuments({ userId: req.params.id });

    res.json(count);
  } catch (error) {
    res.status(500).json("error occured");
  }
};

exports.getUserData = async (req, res, next) => {
  const search = req.query.search || "";

  let query = {
    $or: [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ],
  };

  try {
    const currentUserId = req.user.userId;

    const users = await User.find(query);

    const currentUser = await User.findById(currentUserId).select("block");

    let filteredUsers = users.filter(
      (u) =>
        u._id.toString() !== currentUserId &&
        !currentUser.block.includes(u._id.toString())
    );

    filteredUsers = filteredUsers.filter(
      (u) => !u.block.includes(currentUserId)
    );

    res.json(filteredUsers);
  } catch (err) {
    console.error("Error in getUserData:", err);
    res.status(500).json("error occurred");
  }
};

exports.followUser = async (req, res) => {
  try {
    const io = req.app.get("socketio");

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    const loggedInUserId = req.user.userId;
    const targetUserId = req.params.id;

    if (loggedInUserId === targetUserId) {
      return res.status(400).json({ message: "You cannot follow yourself." });
    }

    const loggedInUser = await User.findById(loggedInUserId);
    const targetUser = await User.findById(targetUserId);

    if (!loggedInUser || !targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!loggedInUser.follow) loggedInUser.follow = [];

    const isFollowing = loggedInUser.follow.includes(targetUserId);

    if (isFollowing) {
      loggedInUser.follow = loggedInUser.follow.filter(
        (id) => id.toString() !== targetUserId
      );
    } else {
      loggedInUser.follow.push(targetUserId);

      const notification = new Notification({
        userId: targetUserId,
        senderId: loggedInUserId,
        message: `${loggedInUser.name} started following you.`,
        read: false,
      });

      await notification.save();

      const targetSocketId = global.connectedUsers.get(targetUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit("notifications", {
          type: "single",
          data: notification,
        });
      }
    }

    await loggedInUser.save();
    await targetUser.save();

    const followers = await User.find({ follow: loggedInUserId }).select(
      "name profile"
    );
    const count = followers.length;

    return res.json({ user: loggedInUser.follow, count });
  } catch (error) {
    console.error(" Error in followUser:", error);
    return res.status(500).json({ message: "An error occurred", error });
  }
};

exports.getUserFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    res.json(user.follow);
  } catch (error) {
    res.status(500).json({ message: "Error retrieving following list" });
  }
};

exports.goToProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).populate(
      "follow",
      "name profile"
    );
    const post = await Post.find({ userId: req.params.id }).find({
      isFlagged: false,
    });
    const loginUser = await User.findById(req.user.userId);
    const loginUser2 = await User.findById(req.user.userId).populate(
      "follow",
      "name profile"
    );
    const mutualconnection = loginUser2.follow.filter((followedUser) =>
      user.follow.some(
        (otherUser) => otherUser._id.toString() === followedUser._id.toString()
      )
    );
    res.json({ user, post, loginUser, mutualconnection });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving following list" });
  }
};

exports.getFollower = async (req, res, next) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const followers = await User.find({ follow: userId }).select(
      "name profile"
    );
    const count = followers.length;
    res.json({ followers, count });
  } catch (error) {
    console.error("Error fetching followers:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getSender = async (req, res, next) => {
  username = req.params.sender;

  const user = await User.findOne({ name: username });
  res.json(user);
};

exports.getReciever = async (req, res, next) => {
  username = req.params.reciever;

  const user = await User.findOne({ name: username });
  res.json(user);
};

exports.BlockUser = async (req, res, next) => {
  const userId = req.params.id;
  const loginUser = req.user.userId;
  try {
    const user = await User.findById(loginUser);
    if (user.block.includes(userId)) {
      user.block.pull(userId);
    } else {
      user.block.push(userId);
      user.follow.pull(userId);
    }
    await user.save();
    res.json(user);
  } catch (error) {
    res.json(error);
  }
};

exports.GetBlockedUser = async (req, res, next) => {
  const loginUser = req.user.userId;
  try {
    const user = await User.findById(loginUser).populate(
      "block",
      "name profile"
    );
    res.json(user);
  } catch (error) {
    res.json(error);
  }
};

exports.block = async (req, res, next) => {
  const loginUser = req.user.userId;
  try {
    const user = await User.findById(loginUser);
    res.json(user);
  } catch (error) {
    res.json(error);
  }
};

exports.checkIfBlockedByUser = async (req, res, next) => {
  const loginUserId = req.user.userId;
  const profileUserId = req.params.id;

  try {
    const profileUser = await User.findById(profileUserId);
    if (!profileUser) return res.status(404).json({ blocked: false });

    const isBlocked = profileUser.block.includes(loginUserId);
    res.json({ blocked: isBlocked });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};
