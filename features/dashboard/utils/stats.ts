export type Log = {
  date: string;
  mental?: {
    mood?: number;
    energy?: number;
    stress?: number;
    anxiety?: number;
    focus?: number;
  };
  sleep?: {
    hours?: number;
    quality?: number;
  };
  physical?: {
    gym?: boolean;
  };
  work?: {
    coded?: boolean;
    deepWorkHours?: number;
  };
  habits?: {
    noFap?: boolean;
  };
};

export function calculateStreak<T>(
  logs: T[],
  predicate: (log: T) => boolean
): number {
  let streak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (predicate(logs[i])) streak++;
    else break;
  }
  return streak;
}

export function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
