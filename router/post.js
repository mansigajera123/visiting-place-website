const express = require("express");

const router = express.Router();

const postController = require("../controller/postController");

const upload = require("../middleware/upload");

const authenticate = require("../middleware/auth");

router.post(
  "/addpost",
  authenticate,
  upload.single("image"),
  postController.addPost
);

router.get("/viewpost", authenticate, postController.viewPost);

router.get("/postdata", authenticate, postController.getpost);

router.get("/:id/detail", authenticate, postController.detailView);

router.get("/getallpost", authenticate, postController.getAllPost);

router.delete("/:id/delete", authenticate, postController.deletePost);

router.post(
  "/:id/edit",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "moreImage", maxCount: 5 },
  ]),
  postController.editPost
);

router.post("/:id/favourite", authenticate, postController.addToFavourite);

router.delete(
  "/:id/remove/favourite",
  authenticate,
  postController.removeFavourite
);

router.get("/favourite", authenticate, postController.viewFavourite);

router.post("/review", authenticate, postController.postReview);

router.get("/getreview/:id", authenticate, postController.getReview);

router.get("/:country/getpost", authenticate, postController.getCountryPost);

router.get("/:id/generatePdf", authenticate, postController.generatePdf);

router.post("/:id/comment", authenticate, postController.sendComment);

router.get("/:id/viewcomment", authenticate, postController.getComments);

router.post("/reply/:commentId", authenticate, postController.replyToComment);

router.get("/feed", authenticate, postController.getFeed);

router.get("/trending", authenticate, postController.getTrendingPostsAdvanced);

router.post("/like/:commentId", authenticate, postController.LikeComments);

router.get("/like", authenticate, postController.getLike);

router.get("/categories", authenticate, postController.getCategory);

router.get("/posts/:category", authenticate, postController.getCategoryPost);

router.get("/search", authenticate, postController.getSearch);

router.get("/hashtag/:tag", authenticate, postController.getHashtag);

router.post(
  "/experience/:id",
  upload.single("imageUrl"),
  authenticate,
  postController.uploadExperience
);

router.get("/getexp/:id", authenticate, postController.getExperience);

router.post("/report/:postId", authenticate, postController.ReportPost);

router.delete(
  "/comments/:commentId",
  authenticate,
  postController.deleteComment
);

router.post(
  "/report/comment/:commentId",
  authenticate,
  postController.ReportComment
);

router.post(
  "/upvote/:postId/:reviewId",
  authenticate,
  postController.upvoteReview
);

router.post(
  "/downvote/:postId/:reviewId",
  authenticate,
  postController.downvoteReview
);

router.put("/:id/archive", authenticate, postController.makeArchive);

router.get("/getarchive", authenticate, postController.getArchive);

module.exports = router;
