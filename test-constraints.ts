import mongoose from "mongoose";
import { config } from "dotenv";
import { buildConstraintProfile } from "./server/planner/constraints/buildConstraintProfile";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error("No DB URI found");
  
  await mongoose.connect(uri);
  
  // Fake User ID to ensure we handle empty DBs without NaN or crashes.
  const userId = new mongoose.Types.ObjectId().toString();
  
  try {
    console.log("Building constraint profile...");
    const profile = await buildConstraintProfile(userId);
    console.log("Constraint Profile generated successfully:");
    console.log(JSON.stringify(profile, null, 2));
  } catch (e) {
    console.error("Error building profile:", e);
  } finally {
    await mongoose.disconnect();
  }
}

main();
