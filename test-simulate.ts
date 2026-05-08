import { parseLocalToUTC } from "./server/automation/timeUtils";
console.log(parseLocalToUTC("this Sunday", "15:00", "Asia/Kolkata"));
