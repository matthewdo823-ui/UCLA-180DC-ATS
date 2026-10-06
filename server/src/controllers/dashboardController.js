const { getGraderDashboard, getAdminDashboard } = require("../services/dashboardService");
const { respondWithServerError } = require("../utils/httpErrors");

exports.getGraderDashboard = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const payload = await getGraderDashboard(userId, req.user.role);
    return res.json(payload);
  } catch (err) {
    return respondWithServerError(res, err, "getGraderDashboard");
  }
};

exports.getAdminDashboard = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const payload = await getAdminDashboard(userId);
    return res.json(payload);
  } catch (err) {
    return respondWithServerError(res, err, "getAdminDashboard");
  }
};
