const router = require("express").Router();
const { col } = require("../db");

router.get("/weekly", async (_req, res) => {
  const c = await col("rewards");
  const top = await c.find({}).sort({ points: -1 }).limit(10).toArray();
  res.json(top.map(({ patientId, points, badges, streakDays }) => ({
    patientId, points, badges, streakDays
  })));
});

module.exports = router;
