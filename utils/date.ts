export function getTodayDateString() {
  const now = new Date();


  const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);

  const year = istTime.getFullYear();
  const month = String(istTime.getMonth() + 1).padStart(2, "0");
  const day = String(istTime.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
