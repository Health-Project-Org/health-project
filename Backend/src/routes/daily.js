const router = require("express").Router();
const { col } = require("../db");

router.get("/:patientId", async (req, res) => {
  const { patientId } = req.params;
  const { from, to } = req.query;
  try {
    const c = await col("daily_logs");
    const q = { patientId };
    if (from || to) q.date = {};
    if (from) q.date.$gte = from;
    if (to) q.date.$lte = to;
    const docs = await c.find(q).sort({ date: -1 }).toArray();
    res.json(docs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db error" });
  }
});

router.put("/:patientId/today", async (req, res) => {
  const { patientId } = req.params;
  const today = new Date().toISOString().slice(0, 10);
  const payload = req.body || {};
  try {
    const c = await col("daily_logs");
    await c.updateOne(
      { patientId, date: today },
      {
        $set: {
          patientId,
          date: today,
          steps: 0,
          hydrationPct: 0,
          medsTaken: 0,
          medsTotal: 0,
          weeklyGoalPct: 0,
          ...payload,
        },
      },
      { upsert: true }
    );
    const doc = await c.findOne({ patientId, date: today });
    res.json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db error" });
  }
});

router.patch("/:patientId/today", async (req, res) => {
  const { patientId } = req.params;
  const today = new Date().toISOString().slice(0, 10);
  const { steps, hydrationPct, medsTaken, medsTotal, weeklyGoalPct } = req.body || {};

  const $inc = {};
  const $set = {};
  if (typeof steps === "number") $inc.steps = steps;
  if (typeof hydrationPct === "number") $set.hydrationPct = hydrationPct;
  if (typeof medsTaken === "number") $set.medsTaken = medsTaken;
  if (typeof medsTotal === "number") $set.medsTotal = medsTotal;
  if (typeof weeklyGoalPct === "number") $set.weeklyGoalPct = weeklyGoalPct;

  try {
    const c = await col("daily_logs");
    const update = {};
    if (Object.keys($set).length) update.$set = { patientId, date: today, ...$set };
    if (Object.keys($inc).length) update.$inc = $inc;

    await c.updateOne({ patientId, date: today }, update, { upsert: true });
    const doc = await c.findOne({ patientId, date: today });
    res.json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db error" });
  }
});

module.exports = router;
