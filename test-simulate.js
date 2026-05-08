const { parseLocalToUTC } = require("./server/automation/timeUtils.ts");
const tsNode = require("ts-node");
tsNode.register({
  compilerOptions: {
    module: "commonjs"
  }
});
const timeUtils = require("./server/automation/timeUtils.ts");

console.log(timeUtils.parseLocalToUTC("2026-05-10", "15:00", "Asia/Kolkata"));
