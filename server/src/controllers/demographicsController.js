const { getDemographicsSnapshot } = require("../services/demographicsService");
const { respondWithServerError } = require("../utils/httpErrors");

exports.getDemographics = async (_req, res) => {
  try {
    const snapshot = await getDemographicsSnapshot();
    if (snapshot.error) {
      return res.status(snapshot.status).json({ error: snapshot.error });
    }
    return res.json(snapshot);
  } catch (err) {
    return respondWithServerError(res, err, "getDemographics");
  }
};
