const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  const token = req.headers.authorization
    ? req.headers.authorization.split(" ")[1]
    : null;

  jwt.verify(token, "secretsupersecretsecret", (err, decodedToken) => {
    req.user = decodedToken;
    next();
  });
};

module.exports = authenticate;
