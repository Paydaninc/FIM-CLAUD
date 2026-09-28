const jwt = require('jsonwebtoken');

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function verifyAccessToken(token) {
  // Throws if invalid/expired — caller (auth middleware) is responsible for catching.
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signAccessToken, verifyAccessToken };
