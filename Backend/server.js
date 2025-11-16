// npm i express cors mongodb dotenv
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const patients = require("./src/routes/patients");
const goals = require("./src/routes/goals");
const daily = require("./src/routes/daily");
const rewards = require("./src/routes/rewards");
const leaderboard = require("./src/routes/leaderboard");

app.use("/api/patients", patients);
app.use("/api/goals", goals);
app.use("/api/daily", daily);
app.use("/api/rewards", rewards);
app.use("/api/leaderboard", leaderboard);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 5050;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
