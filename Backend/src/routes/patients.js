const router = require("express").Router();
const { col } = require("../db");

router.get("/", async (_req, res) => {
  try {
    const c = await col("HealthDataPatients");
    const patients = await c.find({}).toArray();
    res.json(patients);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db error" });
  }
});

module.exports = router;
