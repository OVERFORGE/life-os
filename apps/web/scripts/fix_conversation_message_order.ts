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

  const messagesCol = db.collection("conversationmessages");
  const allMessages = await messagesCol.find({}).sort({ createdAt: 1, _id: 1 }).toArray();
  console.log(`Checking ${allMessages.length} conversation messages...`);

  let adjustedCount = 0;
  for (let i = 0; i < allMessages.length; i++) {
    const cur = allMessages[i];
    if (cur.role === "assistant" && cur.createdAt) {
      // Find preceding or following user message with the same millisecond timestamp
      const curTime = new Date(cur.createdAt).getTime();
      const prev = allMessages[i - 1];
      const next = allMessages[i + 1];

      if (prev && prev.role === "user" && new Date(prev.createdAt).getTime() === curTime) {
        const newAssistantTime = new Date(curTime + 500);
        await messagesCol.updateOne({ _id: cur._id }, { $set: { createdAt: newAssistantTime } });
        adjustedCount++;
      } else if (next && next.role === "user" && new Date(next.createdAt).getTime() === curTime) {
        // Assistant was somehow indexed BEFORE user with exact same timestamp!
        // Move user time to 500ms before or assistant time to 500ms after
        const newAssistantTime = new Date(curTime + 500);
        await messagesCol.updateOne({ _id: cur._id }, { $set: { createdAt: newAssistantTime } });
        adjustedCount++;
      }
    }
  }

  console.log(`Adjusted ${adjustedCount} message timestamps.`);
  await mongoose.disconnect();
}

main().catch(console.error);
