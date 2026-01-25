export type DailyLogForm = {
  mental: {
    mood: number;
    energy: number;
    stress: number;
    anxiety: number;
    focus: number;
  };
  sleep: {
    hours: number;
    quality: number;
    sleepTime: string;
    wakeTime: string;
  };
  physical: {
    gym: boolean;
    workoutType: string;
    calories: number;
    meals: number;
    dietNote: string;
    steps: number;
    bodyFeeling: "weak" | "normal" | "strong";
    painNote: string;
  };
  work: {
    deepWorkHours: number;
    coded: boolean;
    executioners: boolean;
    studied: boolean;
    mainWork: string;
  };
  habits: {
    gym: boolean;
    reading: boolean;
    meditation: boolean;
    coding: boolean;
    content: boolean;
    learning: boolean;
    noFap: boolean;
    junkFood: {
      had: boolean;
      times: number;
      what: string;
    };
    socialMediaOveruse: boolean;
  };
  planning: {
    plannedTasks: number;
    completedTasks: number;
    reasonNotCompleted: string;
  };
  reflection: {
    win: string;
    mistake: string;
    learned: string;
    bothering: string;
  };
};
