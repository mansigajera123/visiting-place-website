const { body } = require("express-validator");

exports.signupValidator = [
  body("email").isEmail().withMessage("Please enter a valid email address."),
  body("password")
    .isLength({ min: 3 })
    .withMessage("Password must be at least 3 characters long."),
  body("confirmpassword").custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error("Passwords do not match");
    }
    return true;
  }),
];

exports.loginValidator = [
  body("email").isEmail().withMessage("Please enter a valid email address."),
  body("password")
    .isLength({ min: 3 })
    .withMessage("Password is required.")
    .trim(),
];

exports.forgotPasswordValidator = [
  body("email").isEmail().withMessage("Please enter a valid email address."),
];
