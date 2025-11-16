const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Missing MONGODB_URI in .env");
  process.exit(1);
}
const DB_NAME = process.env.MONGODB_DB || "HealthData";

let _client;

async function getClient() {
  if (!_client || !_client.topology || !_client.topology.isConnected()) {
    _client = new MongoClient(uri);
    await _client.connect();
  }
  return _client;
}

async function col(name) {
  const client = await getClient();
  return client.db(DB_NAME).collection(name);
}

module.exports = { col };
