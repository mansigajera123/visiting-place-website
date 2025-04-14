const express = require("express");
const Notification = require("../model/notification");
const router = express.Router();

router.get("/notifications/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const unreadNotifications = await Notification.find({
      userId: userId,
      isRead: false,
    }).sort({ createdAt: -1 });

    res.status(200).json(unreadNotifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/notifications/read/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedNotification = await Notification.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true }
    );

    if (!updatedNotification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json(updatedNotification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});


module.exports = router;
