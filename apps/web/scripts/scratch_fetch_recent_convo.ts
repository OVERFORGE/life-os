import mongoose from "mongoose";

const MONGODB_URI = 'mongodb+srv://overforge:overforgedatabase@cluster0.s8cvx.mongodb.net/life-os';

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;
  if (!db) {
    console.error("No db");
    process.exit(1);
  }

  // Find recent conversation messages
  const messagesCol = db.collection("conversationmessages");
  const recentMessages = await messagesCol.find({}).sort({ createdAt: -1 }).limit(35).toArray();
  console.log("\n=== RECENT CONVERSATION MESSAGES (last 35) ===");
  for (const msg of recentMessages.reverse()) {
    const time = msg.createdAt ? new Date(msg.createdAt).toISOString() : 'no date';
    const role = msg.sender || msg.role || 'unknown';
    const text = msg.content || msg.text || '';
    console.log(`[${time}] [${role}]: ${text}`);
    if (msg.toolCalls || msg.actions || msg.metadata) {
      console.log(`  -> metadata/actions/tools:`, JSON.stringify({ tools: msg.toolCalls, actions: msg.actions, meta: msg.metadata }));
    }
  }

  // Also check action audit records
  const auditCol = db.collection("actionauditrecords");
  const recentAudits = await auditCol.find({}).sort({ createdAt: -1 }).limit(10).toArray();
  console.log("\n=== RECENT ACTION AUDIT RECORDS ===");
  for (const a of recentAudits) {
    console.log(JSON.stringify(a, null, 2));
  }

  // Also check execution event records
  const execEventCol = db.collection("executioneventrecords");
  const recentEvents = await execEventCol.find({}).sort({ timestamp: -1 }).limit(10).toArray();
  console.log("\n=== RECENT EXECUTION EVENT RECORDS ===");
  for (const e of recentEvents) {
    console.log(JSON.stringify(e, null, 2));
  }

  // Also check daily logs
  const dailyCol = db.collection("dailylogs");
  const recentLogs = await dailyCol.find({}).sort({ date: -1 }).limit(5).toArray();
  console.log("\n=== RECENT DAILY LOGS ===");
  for (const d of recentLogs) {
    console.log(JSON.stringify({ date: d.date, userId: d.userId, meals: d.meals?.length, metrics: d.metrics }, null, 2));
  }

  await mongoose.disconnect();
}

main().catch(console.error);
