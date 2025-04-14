const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "images");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  const allowType = ["image/png", "image/jpeg", "image/jpg", "video/mp4"];

  if (allowType.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Only PNG, JPG, and JPEG are allowed!"),
      false
    );
  }
};

const upload = multer({ storage, fileFilter });

module.exports = upload;
