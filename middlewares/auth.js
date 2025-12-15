const { verifyToken } = require('../utils/jwt');

function authMiddleware(req, res, next) {
  const token = req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Пользователь не авторизован',
    });
  }

  try {
    const payload = verifyToken(token);

    // payload = { userId, role, iat, exp }
    req.user = {
      userId: payload.userId,
      role: payload.role,
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Неверный или просроченный токен',
    });
  }
}

module.exports = { authMiddleware };
