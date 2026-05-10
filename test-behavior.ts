import mongoose from "mongoose";
import { config } from "dotenv";
import { buildBehavioralProfile } from "./server/planner/behavior/buildBehavioralProfile";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error("No DB URI found");
  
  await mongoose.connect(uri);
  
  const userId = new mongoose.Types.ObjectId().toString(); // Use a fake ID just to test safe defaults
  
  try {
    console.log("Building profile...");
    const profile = await buildBehavioralProfile(userId);
    console.log("Profile generated successfully:");
    console.log(JSON.stringify(profile, null, 2));
  } catch (e) {
    console.error("Error building profile:", e);
  } finally {
    await mongoose.disconnect();
  }
}

main();
