import { detectIntent } from "./intent";
import { decideAction } from "./decision";
import { executeTool } from "./executor";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";
import { LifeSignal } from "@/features/signals/models/LifeSignal";

/* ===================================================== */
/* 🧠 HELPERS                                            */
/* ===================================================== */

async function getPendingAction(userId: string) {
  return ConversationMessage.findOne({
    userId,
    role: "system",
    content: { $regex: "PENDING_ACTION:" },
  })
    .sort({ createdAt: -1 })
    .lean();
}

async function setPendingAction(userId: string, data: any) {
  await ConversationMessage.create({
    userId,
    role: "system",
    content: `PENDING_ACTION:${JSON.stringify(data)}`,
  });
}

async function clearPendingAction(userId: string) {
  await ConversationMessage.deleteMany({
    userId,
    role: "system",
    content: { $regex: "PENDING_ACTION:" },
  });
}

/* ===================================================== */
/* 🧠 HARD OVERRIDE (NEW - CRITICAL FIX)                 */
/* ===================================================== */

async function shouldForceLog(
  message: string,
  userId: string
) {
  const lower = message.toLowerCase();

  /* 🔥 sleep / wake ALWAYS */
  if (
    lower.includes("sleep") ||
    lower.includes("slept") ||
    lower.includes("wake") ||
    lower.includes("woke")
  ) {
    return true;
  }

  /* 🔥 duration ALWAYS */
  if (lower.match(/\d+\s*(hour|hr|hrs)/)) {
    return true;
  }

  /* 🔥 signal match ALWAYS */
  const signals = await LifeSignal.find({
    userId,
    enabled: true,
  }).lean();

  for (const sig of signals) {
    const key = sig.key.toLowerCase();
    const label = sig.label.toLowerCase();

    const spacedKey = key.replace(/([A-Z])/g, " $1").toLowerCase();

    if (
      lower.includes(key) ||
      lower.includes(label) ||
      lower.includes(spacedKey)
    ) {
      return true;
    }
  }

  return false;
}

/* ===================================================== */
/* 🧠 SMART ACTIVITY DETECTION (YOUR ORIGINAL)           */
/* ===================================================== */

async function shouldLogActivity(
  message: string,
  userId: string
) {
  const lower = message.toLowerCase();

  const pastIndicators = [
    "i did",
    "i went",
    "i worked",
    "i studied",
    "i coded",
    "i ran",
    "i exercised",
    "i slept",
    "i didn't",
    "i did not",
    "today",
    "yesterday",
    "this morning",
    "earlier",
  ];

  const hasPastContext = pastIndicators.some((p) =>
    lower.includes(p)
  );

  if (!hasPastContext) return false;

  const signals = await LifeSignal.find({
    userId,
    enabled: true,
  }).lean();

  for (const sig of signals) {
    const key = sig.key.toLowerCase();
    const label = sig.label.toLowerCase();

    if (lower.includes(key) || lower.includes(label)) {
      return true;
    }

    const spacedKey = key.replace(/([A-Z])/g, " $1").toLowerCase();
    if (lower.includes(spacedKey)) {
      return true;
    }
  }

  return false;
}

/* ===================================================== */
/* 🧠 MAIN                                               */
/* ===================================================== */

export async function runAssistantBrain({
  message,
  context,
  userId,
}: {
  message: string;
  context: any;
  userId: string;
}) {
  const lower = message.toLowerCase();

  /* ===================================================== */
  /* 🟢 STEP 1: CONFIRMATION                             */
  /* ===================================================== */

  const isConfirmation =
    lower.includes("yes") ||
    lower.includes("confirm") ||
    lower.includes("do it") ||
    lower.includes("sure") ||
    lower.includes("ok") ||
    lower.includes("okay") ||
    lower.includes("indeed");

  const pendingDoc = await getPendingAction(userId);

  if (pendingDoc && isConfirmation) {
    const pending = JSON.parse(
      pendingDoc.content.replace("PENDING_ACTION:", "")
    );

    await clearPendingAction(userId);

    console.log("✅ Executing confirmed action:", pending);

    const result = await executeTool({
      tool: pending.tool,
      message: pending.message,
      context,
      userId,
    });

    return {
      type: "tool_executed",
      intent: pending.intent,
      tool: pending.tool,
      result,
    };
  }

  /* ===================================================== */
  /* 🔥 STEP 2: FORCE LOG (NEW - FIXES YOUR BUG)          */
  /* ===================================================== */

  const forceLog = await shouldForceLog(message, userId);

  if (forceLog) {
    console.log("🔥 FORCE LOG TRIGGERED");

    const result = await executeTool({
      tool: "log_activity",
      message,
      context,
      userId,
    });

    return {
      type: "tool_executed",
      intent: "log_activity",
      tool: "log_activity",
      result,
    };
  }

  /* ===================================================== */
  /* 🔥 STEP 3: AUTO LOG (YOUR ORIGINAL SYSTEM)           */
  /* ===================================================== */

  const shouldLog = await shouldLogActivity(message, userId);

  if (shouldLog) {
    console.log("🔥 AUTO LOG TRIGGERED");

    const result = await executeTool({
      tool: "log_activity",
      message,
      context,
      userId,
    });

    return {
      type: "tool_executed",
      intent: "log_activity",
      tool: "log_activity",
      result,
    };
  }

  /* ===================================================== */
  /* 🟢 STEP 4: NORMAL INTENT FLOW                       */
  /* ===================================================== */

  const intent = await detectIntent(message, context);
  const decision = decideAction(intent);

  console.log("Intent:", intent);
  console.log("Decision:", decision);

  if (!decision.requiresTool) {
    return {
      type: "response_only",
      intent,
      tool: null,
      result: null,
    };
  }

  /* ===================================================== */
  /* 🟡 STEP 5: GOAL CONFIRMATION                         */
  /* ===================================================== */

  if (decision.tool === "create_goal") {
    await setPendingAction(userId, {
      tool: "create_goal",
      message,
      intent,
    });

    console.log("🟡 Stored pending action");

    return {
      type: "confirmation_required",
      intent,
      tool: "create_goal",
      preview: message,
    };
  }

  /* ===================================================== */
  /* 🟢 STEP 6: DIRECT EXECUTION                          */
  /* ===================================================== */

  const result = await executeTool({
    tool: decision.tool,
    message,
    context,
    userId,
  });

  return {
    type: "tool_executed",
    intent,
    tool: decision.tool,
    result,
  };
}