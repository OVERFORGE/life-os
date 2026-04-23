import { connectDB } from "../server/db/connect";
import { NutritionLog } from "../server/db/models/NutritionLog";

async function main() {
  await connectDB();
  const logs = await NutritionLog.find({}).select("date meals dailyTotals").sort({ date: -1 }).limit(10);
  console.log("Found", logs.length, "logs:");
  logs.forEach(l => {
    console.log(`- Date: ${l.date}, Meals: ${l.meals?.length}, Cals: ${l.dailyTotals?.calories}`);
  });
  process.exit(0);
}

main();
