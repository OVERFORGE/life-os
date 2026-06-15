export const EQUIPMENT_BY_CATEGORY: Record<string, string[]> = {
  "Chest": [
    "Barbell Bench Press", "Dumbbell Bench Press", "Incline Barbell Bench Press", "Incline Dumbbell Bench Press",
    "Decline Bench Press", "Pec Deck Machine", "Cable Crossover", "Chest Dip", "Push-ups", "Machine Chest Press",
  ],
  "Back": [
    "Deadlift", "Barbell Row", "Dumbbell Row", "Lat Pulldown (Wide Grip)", "Lat Pulldown (Close Grip)",
    "Pull-ups", "Chin-ups", "Seated Cable Row", "T-Bar Row", "Machine Row", "Straight Arm Pulldown", "Hyperextensions",
  ],
  "Shoulders": [
    "Overhead Press (Barbell)", "Seated Dumbbell Press", "Arnold Press", "Lateral Raises (Dumbbell)",
    "Lateral Raises (Cable)", "Front Raises", "Face Pulls", "Reverse Pec Deck", "Smith Machine Shoulder Press",
  ],
  "Biceps": [
    "Barbell Curl", "Dumbbell Curl", "Hammer Curl", "Preacher Curl", "Cable Bicep Curl", "Concentration Curl", "EZ Bar Curl",
  ],
  "Triceps": [
    "Tricep Pushdown (Rope)", "Tricep Pushdown (Straight Bar)", "Overhead Tricep Extension", "Skull Crushers",
    "Close-Grip Bench Press", "Tricep Dips", "Dumbbell Kickbacks",
  ],
  "Legs": [
    "Barbell Squat", "Front Squat", "Leg Press", "Hack Squat", "Lunges (Dumbbell)", "Bulgarian Split Squat",
    "Leg Extension", "Lying Leg Curl", "Seated Leg Curl", "Romanian Deadlift (RDL)", "Standing Calf Raise",
    "Seated Calf Raise", "Hip Thrust (Barbell)", "Glute Kickback Machine", "Goblet Squat",
  ],
  "Core": [
    "Crunches", "Plank", "Hanging Leg Raises", "Cable Woodchoppers", "Russian Twists", "Ab Wheel Rollout",
  ],
  "Cardio": [
    "Treadmill", "Stairmaster", "Rowing Machine", "Stationary Bike", "Elliptical", "Kettlebell Swing", "Battle Ropes",
  ],
};

// Flat list for backward compatibility
export const PRE_SEEDED_EQUIPMENT = Object.values(EQUIPMENT_BY_CATEGORY).flat();
