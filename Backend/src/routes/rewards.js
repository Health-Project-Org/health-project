const router = require("express").Router();
const { col } = require("../db");

router.get("/:patientId", async (req, res) => {
  const { patientId } = req.params;
  const c = await col("rewards");
  const r = (await c.findOne({ patientId })) || {
    patientId, points: 0, badges: [], streakDays: 0, lastActiveDate: null
  };
  res.json({ ...r, totalPoints: r.points });
});

router.post("/:patientId/earn", async (req, res) => {
  const { patientId } = req.params;
  const { points = 0, badge } = req.body || {};
  const today = new Date().toISOString().slice(0, 10);

  const logs = await col("daily_logs");
  const todayLog = await logs.findOne({ patientId, date: today });
  const metToday = (todayLog?.weeklyGoalPct || 0) >= 80;

  const c = await col("rewards");
  const update = {
    $inc: { points },
    $set: { lastActiveDate: today },
    ...(badge ? { $addToSet: { badges: badge } } : {}),
    ...(metToday ? { $inc: { streakDays: 1 } } : { $set: { streakDays: 0 } }),
  };
  const r = await c.findOneAndUpdate(
    { patientId },
    update,
    { upsert: true, returnDocument: "after" }
  );
  res.json({ ...r.value, totalPoints: r.value.points });
});

module.exports = router;
