const express = require("express");

const router = express.Router();

const authenticate = require("../middleware/auth");

const userController = require("../controller/userController");

const upload = require("../middleware/upload");

const validator = require("../middleware/validator");

router.post("/signup", validator.signupValidator, userController.signUp);

router.post(
  "/login",
  validator.loginValidator,
  authenticate,
  userController.login
);

router.post(
  "/forgot-password",
  validator.forgotPasswordValidator,
  userController.forgotPassword
);

router.post("/reset-password", userController.resetPassword);

router.put(
  "/profile",
  upload.single("profile"),
  authenticate,
  userController.profile
);

router.get("/viewprofile", authenticate, userController.viewProfile);

router.get("/:id/count", authenticate, userController.countPost);

router.get("/user", authenticate, userController.getUserData);

router.post("/:id/follow", authenticate, userController.followUser);

router.get("/following", authenticate, userController.getUserFollowing);

router.get("/:id/profile", authenticate, userController.goToProfile);

router.get("/:id/follower", authenticate, userController.getFollower);

router.get("/users/:sender", authenticate, userController.getSender);

router.get("/users/:reciever", authenticate, userController.getReciever);

router.post("/:id/block", authenticate, userController.BlockUser);

router.get("/getblockuser", authenticate, userController.GetBlockedUser);

router.get("/block", authenticate, userController.block);

router.get(
  "/:id/check-blocked",
  authenticate,
  userController.checkIfBlockedByUser
);
module.exports = router;
