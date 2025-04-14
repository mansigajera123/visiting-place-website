const express = require("express");

const router = express.Router();

const adminController = require("../controller/adminController");

const upload = require("../middleware/upload");

const authenticate = require("../middleware/authAdmin");

const postController = require("../controller/postController");

router.post("/admin-login", adminController.login);

router.get("/getuser", authenticate, adminController.getUser);

router.get("/postdata", authenticate, adminController.getPost);

router.get("/dashboard", authenticate, adminController.dashboard);

router.delete("/admin/:id/delete", authenticate, adminController.deletePost);

router.delete("/user/:id/delete", authenticate, adminController.deleteUser);

router.post(
  "/admin/:id/edit",
  upload.single("profile"),
  authenticate,
  adminController.editUser
);

router.get("/:id/userdata", authenticate, adminController.viewProfile);

router.get("/admin/review", authenticate, adminController.getAllReviews);

router.delete(
  "/admin/review/:id/:reviewId",
  authenticate,
  adminController.deleteReview
);

router.post(
  "/addPeople",
  upload.single("profile"),
  authenticate,
  adminController.AddPeople
);

router.get("/viewAdmin", authenticate, adminController.viewAdmin);

router.get("/allAdmin", authenticate, adminController.allAdmin);

router.post(
  "/admin/post/:id/edit",
  upload.single("image"),
  postController.editPost
);

router.get("/admin/post/:id/detail", authenticate, postController.detailView);

module.exports = router;
