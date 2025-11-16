const router = require("express").Router();
const { col } = require("../db");

router.get("/:patientId", async (req, res) => {
  const { patientId } = req.params;
  const c = await col("goals");
  const g = (await c.findOne({ patientId })) || {
    patientId,
    stepTarget: 8000,
    hydrationTarget: 70,
    requireAllMeds: true,
  };
  res.json(g);
});

router.put("/:patientId", async (req, res) => {
  const { patientId } = req.params;
  const { stepTarget = 8000, hydrationTarget = 70, requireAllMeds = true } = req.body || {};
  const c = await col("goals");
  await c.updateOne(
    { patientId },
    { $set: { patientId, stepTarget, hydrationTarget, requireAllMeds } },
    { upsert: true }
  );
  const g = await c.findOne({ patientId });
  res.json(g);
});

module.exports = router;
