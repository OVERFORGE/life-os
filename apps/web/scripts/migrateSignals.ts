import { connectDB } from "@/server/db/connect";
import { LifeSignal } from "@/features/signals/models/LifeSignal";

async function run() {
  await connectDB();

  const updated = await LifeSignal.updateMany(
    { categoryKey: { $exists: false }, category: { $exists: true } },
    [
      {
        $set: {
          categoryKey: "$category",
        },
      },
    ]
  );

  console.log("Migrated:", updated.modifiedCount);
}

run();
