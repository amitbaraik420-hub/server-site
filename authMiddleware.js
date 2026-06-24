const jwt = require('jsonwebtoken');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized! No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    
    // 🟢 index.js এর সাথে মিলিয়ে সিক্রেট কি 'super-secret-key-123' দেওয়া হলো
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key-123');

    // 🟢 index.js এর সাথে মিল রাখার জন্য req.decoded ব্যবহার করা হলো
    req.decoded = decoded; 
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(401).json({ error: 'Unauthorized! Invalid or expired token.' });
  }
};

module.exports = { requireAuth };