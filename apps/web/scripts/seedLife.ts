import mongoose from "mongoose";
import dotenv from "dotenv";
import { DailyLog } from "@/server/db/models/DailyLog";
import { User } from "@/server/db/models/User";

dotenv.config();

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type State = {
  energy: number;      // 0..10
  fatigue: number;     // 0..10
  discipline: number;  // 0..10
  confidence: number;  // 0..10
  momentum: number;    // 0..10
};

function initialState(): State {
  return {
    energy: 6,
    fatigue: 3,
    discipline: 5,
    confidence: 5,
    momentum: 4,
  };
}

function step(state: State) {
  // Decide if today is a "push day" or "lazy day"
  const pushProbability =
    0.4 +
    state.momentum * 0.05 +
    state.discipline * 0.03 -
    state.fatigue * 0.07;

  const isPushDay = Math.random() < clamp(pushProbability, 0.1, 0.9);

  // Gym & coding behavior
  const coded = isPushDay && Math.random() < 0.85;
  const gym = isPushDay && Math.random() < 0.6;

  // Sleep
  let sleep = isPushDay ? rand(5.5, 7) : rand(7, 8.5);
  if (state.fatigue > 7) sleep = rand(6, 8.5); // forced recovery

  // Fatigue update
  if (isPushDay && (coded || gym)) {
    state.fatigue += rand(0.6, 1.2);
  } else {
    state.fatigue -= rand(0.4, 0.8);
  }

  state.fatigue = clamp(state.fatigue, 0, 10);

  // Energy update
  state.energy = clamp(
    state.energy + (sleep > 7 ? rand(0.3, 0.7) : -rand(0.3, 0.7)) - state.fatigue * 0.05,
    2,
    9
  );

  // Momentum & confidence
  if (coded || gym) {
    state.momentum += rand(0.3, 0.8);
    state.confidence += rand(0.2, 0.5);
  } else {
    state.momentum -= rand(0.3, 0.7);
    state.confidence -= rand(0.2, 0.5);
  }

  state.momentum = clamp(state.momentum, 0, 10);
  state.confidence = clamp(state.confidence, 0, 10);

  // Discipline slowly trends up but dips during slumps
  state.discipline += isPushDay ? rand(0.05, 0.15) : -rand(0.05, 0.2);
  state.discipline = clamp(state.discipline, 3, 8);

  // Psychological metrics
  const mood = clamp(
    Math.round(
      4 +
        state.energy * 0.4 +
        state.confidence * 0.3 -
        state.fatigue * 0.3 +
        rand(-1, 1)
    ),
    2,
    9
  );

  const stress = clamp(
    Math.round(
      3 +
        state.fatigue * 0.6 +
        (isPushDay ? 1 : 0) +
        rand(-1, 1)
    ),
    2,
    9
  );

  const anxiety = clamp(stress + rand(-1, 1), 2, 9);

  const focus = clamp(
    Math.round((state.energy + state.momentum) / 2 + rand(-1, 1)),
    2,
    9
  );

  // NoFap behavior: more likely to fail when fatigued + low confidence
  const noFap =
    Math.random() >
    clamp(0.15 + state.fatigue * 0.05 + (5 - state.confidence) * 0.03, 0.1, 0.6);

  return {
    coded,
    gym,
    sleep,
    mood,
    stress,
    anxiety,
    focus,
    noFap,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const user = await User.findOne();
  if (!user) throw new Error("No user found");

  console.log("Seeding realistic life for:", user.email);

  await DailyLog.deleteMany({ userId: user._id });

  const today = new Date();
  const state = initialState();

  const docs: any[] = [];

  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const day = step(state);

    docs.push({
      userId: user._id,
      date: dateStr,

      mental: {
        mood: day.mood,
        energy: Math.round(state.energy),
        stress: day.stress,
        anxiety: day.anxiety,
        focus: day.focus,
      },

      sleep: {
        hours: Math.round(day.sleep * 10) / 10,
        quality: clamp(Math.round(day.sleep + rand(-1, 1)), 3, 9),
        sleepTime: "01:00",
        wakeTime: "08:00",
      },

      physical: {
        gym: day.gym,
        workoutType: day.gym ? "mixed" : "rest",
        calories: day.gym ? 2400 : 2000,
        dietNote: "",
        steps: day.gym ? 8000 : 3000,
        bodyFeeling: "normal",
        painNote: "",
      },

      work: {
        deepWorkHours: day.coded ? rand(2, 6) : 0,
        coded: day.coded,
        executioners: day.coded && Math.random() < 0.4,
        studied: Math.random() < 0.3,
        mainWork: "",
      },

      habits: {
        gym: day.gym,
        reading: Math.random() < 0.3,
        meditation: Math.random() < 0.2,
        coding: day.coded,
        content: Math.random() < 0.2,
        learning: Math.random() < 0.4,
        noFap: day.noFap,
        junkFood: {
          had: Math.random() < 0.35,
          times: Math.random() < 0.3 ? 1 : 0,
          what: "",
        },
        socialMediaOveruse: Math.random() < 0.4,
      },

      planning: {
        plannedTasks: Math.round(rand(3, 7)),
        completedTasks: Math.round(rand(1, 6)),
        reasonNotCompleted: "",
      },

      reflection: {
        win: "",
        mistake: "",
        learned: "",
        bothering: "",
      },
    });
  }

  await DailyLog.insertMany(docs);

  console.log("✅ Seeded 365 days of realistic flawed human data");
  process.exit(0);
}

main();
