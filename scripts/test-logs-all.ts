import { connectDB } from "../server/db/connect";
import { NutritionLog } from "../server/db/models/NutritionLog";

async function main() {
  await connectDB();
  const logs = await NutritionLog.find({}).select("userId date meals.length").lean();
  console.log("All NutritionLogs in DB:");
  logs.forEach(l => {
    console.log(`- User: ${l.userId}, Date: ${l.date}, Meals: ${l.meals?.length}`);
  });
  process.exit(0);
}
main();
