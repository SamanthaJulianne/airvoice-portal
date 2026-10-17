const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  try {
    const payload = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
    req.user = { mobile: payload.mobile };
    next();
  } catch {
    res.status(401).json({ error: 'Please log in to continue.' });
  }
}

module.exports = { requireAuth };