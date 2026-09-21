import mongoose from "mongoose";

const MONGODB_URI = 'mongodb+srv://overforge:overforgedatabase@cluster0.s8cvx.mongodb.net/life-os';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;
  const collections = await db.listCollections().toArray();

  console.log("=== COLLECTION STATS ===");
  for (const colInfo of collections) {
    const col = db.collection(colInfo.name);
    const count = await col.countDocuments();
    const latestDoc = await col.find({}).sort({ _id: -1 }).limit(1).toArray();
    let latestTime = "none";
    if (latestDoc.length > 0) {
      const doc = latestDoc[0];
      latestTime = doc.createdAt || doc.updatedAt || doc.timestamp || doc.date || doc._id.getTimestamp();
    }
    console.log(`${colInfo.name}: ${count} docs, latest: ${latestTime}`);
  }

  // Check the very latest 50 messages
  const messagesCol = db.collection("conversationmessages");
  const count = await messagesCol.countDocuments();
  console.log(`\nTotal messages in conversationmessages: ${count}`);
  const last50 = await messagesCol.find({}).sort({ _id: -1 }).limit(20).toArray();
  console.log("\n=== LAST 20 MESSAGES BY _id ===");
  for (const m of last50) {
    console.log(`[${m._id.getTimestamp().toISOString()}] [${m.sender || m.role}]: ${(m.content || m.text || '').slice(0, 100)}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
