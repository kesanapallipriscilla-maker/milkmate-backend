const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.',
      });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user   = decoded;
    req.userId = decoded.userId;
    req.phone  = decoded.phone;
    req.role   = decoded.role;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.',
    });
  }
};
