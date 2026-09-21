const ADMIN_SECRET =
  process.env.ADMIN_SECRET_KEY ||
  "kmegle_admin_secret_key_2026";

function adminAuth(req, res, next) {
  const key =
    req.headers["x-admin-key"] ||
    req.query.adminKey;

  if (!key || key !== ADMIN_SECRET) {
    return res.status(401).json({
      error:
        "Unauthorized: Invalid or missing Admin Key",
    });
  }

  next();
}

module.exports = adminAuth;