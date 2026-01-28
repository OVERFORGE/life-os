function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function computeBaselines(logs: any[]) {
  const window = logs.slice(0, 120); // last ~4 months

  return {
    sleep: avg(window.map(l => l.sleep?.hours || 0)),
    mood: avg(window.map(l => l.mental?.mood || 0)),
    stress: avg(window.map(l => l.mental?.stress || 0)),
    energy: avg(window.map(l => l.mental?.energy || 0)),
    deepWork: avg(window.map(l => l.work?.deepWorkHours || 0)),
  };
}
