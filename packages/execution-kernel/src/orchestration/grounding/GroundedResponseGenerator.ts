import { KernelExecutionResult, DOMAIN_CAPABILITIES } from "../contracts/ActionProposalContracts";
import { SemanticTurn, EntityResolutionEvidence } from "../contracts/SemanticTurnContracts";

export interface GroundedResponseOptions {
  userMessage?: string;
  conversationalSummary?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch (_) {
    return String(dateStr);
  }
}

function getHumanFileType(mimeType?: string, name?: string): string {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  if (mimeType === "application/pdf" || ext === "pdf") return "PDF Document";
  if (mimeType?.includes("spreadsheet") || ext === "xlsx" || ext === "csv") return "Spreadsheet";
  if (mimeType?.includes("document") || ext === "docx" || ext === "doc") return "Document";
  if (mimeType?.includes("presentation") || ext === "pptx") return "Presentation";
  if (mimeType?.includes("folder")) return "Folder";
  if (mimeType?.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(ext || "")) return "Image";
  if (mimeType?.startsWith("video/") || ["mp4", "mov", "avi"].includes(ext || "")) return "Video";
  if (mimeType?.startsWith("audio/") || ["mp3", "wav"].includes(ext || "")) return "Audio";
  if (ext === "ipynb") return "Jupyter Notebook";
  if (ext) return `${ext.toUpperCase()} File`;
  return "File";
}

/**
 * GroundedResponseGenerator
 * 
 * Invariant S-7 / Phase 5: Strictly grounded first-person executive communication.
 * Zero internal technical jargon ("taskId", "validation failed", "adapter"),
 * zero third-person LLM prompt leakage ("User wants...").
 */
export class GroundedResponseGenerator {
  private static instance: GroundedResponseGenerator;

  static getInstance(): GroundedResponseGenerator {
    if (!GroundedResponseGenerator.instance) {
      GroundedResponseGenerator.instance = new GroundedResponseGenerator();
    }
    return GroundedResponseGenerator.instance;
  }

  generateResponse(
    turn: SemanticTurn,
    results: KernelExecutionResult[],
    options?: GroundedResponseOptions,
    evidence?: EntityResolutionEvidence[]
  ): string {
    // 1. If turn requires clarification, return clarification question
    if (turn.clarification?.required && turn.clarification.questionToUser) {
      return turn.clarification.questionToUser;
    }

    // 2. If user cancelled or dismissed
    if (turn.primaryClassification === "CANCEL_OR_DISMISS") {
      return "Understood. I've cancelled that.";
    }

    // 3. If no operations were requested (casual dialogue or informational)
    if (results.length === 0) {
      // Strip any accidental third-person prefix or internal action identifiers from conversationalSummary
      const summary = turn.conversationalSummary || "";
      if (
        summary.startsWith("User wants") ||
        summary.startsWith("The user") ||
        summary.startsWith("User ") ||
        summary.includes("_") ||
        summary.includes("create_") ||
        summary.startsWith("Continuing ") ||
        summary.startsWith("Confirmed ")
      ) {
        return "I understand. How else can I assist you?";
      }
      return summary || "I understand. How else can I assist you?";
    }

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    const successSentences: string[] = [];
    for (const r of successes) {
      successSentences.push(this.formatSuccess(r));
    }

    const failureSentences: string[] = [];
    for (const r of failures) {
      failureSentences.push(this.formatFailure(r));
    }

    // Case A: All succeeded
    if (failures.length === 0) {
      return successSentences.join(" ");
    }

    // Case B: All failed
    if (successes.length === 0) {
      return failureSentences.join(" ");
    }

    // Case C: Mixed outcome
    return `${successSentences.join(" ")} However, ${failureSentences.join(" ")}`;
  }

  private formatSuccess(result: KernelExecutionResult): string {
    const { actionType, data } = result;
    const cap = DOMAIN_CAPABILITIES[actionType];

    switch (actionType) {
      case "create_task": {
        const title = result.targetEntity?.displayName || data?.taskTitle || data?.title || data?.task?.title || "task";
        const due = data?.dueDate ? ` for ${data.dueDate}` : "";
        const time = data?.dueTime ? ` at ${data.dueTime}` : "";
        return `I've scheduled that task: "${title}"${due}${time}.`;
      }

      case "complete_task": {
        const title = result.targetEntity?.displayName || data?.task?.title || data?.taskTitle || data?.title || "Task";
        return `Marked "${title}" as complete.`;
      }

      case "adjust_task_priority": {
        const title = result.targetEntity?.displayName || data?.taskTitle || data?.title || data?.task?.title || "task";
        const prio = data?.priority || data?.task?.priority || "high";
        return `I've updated the priority of "${title}" to ${prio}.`;
      }

      case "update_task": {
        const title = result.targetEntity?.displayName || data?.task?.title || data?.title || "task";
        return `Updated task "${title}".`;
      }

      case "reschedule_task": {
        const title = result.targetEntity?.displayName || data?.task?.title || data?.title || "task";
        const due = data?.dueDate || data?.task?.dueDate || "";
        return `Rescheduled "${title}" for ${due}.`;
      }

      case "delete_task": {
        const title = result.targetEntity?.displayName || data?.title || data?.task?.title;
        return title ? `Deleted task "${title}".` : "Deleted that task.";
      }

      case "create_goal":
      case "propose_goal": {
        const title = result.targetEntity?.displayName || data?.title || data?.goal?.title || "goal";
        return `I've proposed that goal: "${title}".`;
      }

      case "confirm_goal": {
        const title = result.targetEntity?.displayName || data?.title || data?.goal?.title || "goal";
        return `Confirmed and activated your goal: "${title}".`;
      }

      case "delete_goal": {
        const title = result.targetEntity?.displayName || data?.title || data?.goal?.title;
        return title ? `Deleted the goal: "${title}".` : "Deleted that goal.";
      }

      case "log_meal": {
        const desc = data?.description || data?.meal?.name || "your meal";
        const cals = data?.dailyTotals?.calories || data?.calories || data?.macros?.calories;
        const calStr = cals ? ` (${cals} kcal)` : "";
        return `Logged ${desc}${calStr}.`;
      }

      case "log_workout": {
        const name = data?.name || data?.workoutType || "workout";
        return `Logged your workout: "${name}".`;
      }

      case "modify_workout": {
        const name = data?.workout?.name || data?.name || "workout";
        return `Updated your workout: "${name}".`;
      }

      case "update_weight": {
        const weight = data?.weight || data?.data?.weight;
        return `Recorded your weight: ${weight} kg.`;
      }

      case "record_mental_estimate": {
        const parts: string[] = [];
        if (data?.energy !== undefined) parts.push(`Energy: ${data.energy}/10`);
        if (data?.stress !== undefined) parts.push(`Stress: ${data.stress}/10`);
        if (data?.mood !== undefined) parts.push(`Mood: ${data.mood}/10`);
        const metricsStr = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        return `Recorded your mental state check-in${metricsStr}.`;
      }

      case "log_activity": {
        const act = data?.activityType || "activity";
        return `Logged activity: ${act}.`;
      }

      case "apply_recovery_constraint": {
        return `Applied recovery constraint for today.`;
      }

      case "set_context_mode": {
        const mode = data?.mode || "focus";
        return `Switched context mode to ${mode}.`;
      }

      case "clear_context_mode": {
        return `Reset context mode to default.`;
      }

      case "schedule_occurrence": {
        const title = result.targetEntity?.displayName || data?.title || "block";
        const interval = data?.plannedInterval;
        const dateStr = interval?.dateOnly ? ` on ${interval.dateOnly}` : "";
        const durStr = interval?.durationMinutes ? ` (${interval.durationMinutes} min)` : "";
        return `I've scheduled "${title}"${dateStr}${durStr} on your calendar.`;
      }

      case "reschedule_occurrence": {
        const title = result.targetEntity?.displayName || data?.title || "block";
        return `Rescheduled "${title}".`;
      }

      case "cancel_occurrence": {
        const title = result.targetEntity?.displayName || data?.title || "scheduled block";
        const verb = data?.status === "SKIPPED" ? "Skipped" : "Cancelled";
        return `${verb} "${title}".`;
      }

      case "create_temporal_series": {
        const title = data?.title || "recurring schedule";
        return `Created recurring routine: "${title}".`;
      }

      case "log_execution_interval": {
        const title = data?.title || "session";
        const dur = data?.durationMinutes ? ` (${data.durationMinutes} min)` : "";
        return `Logged session: "${title}"${dur}.`;
      }


      case "external_capability_action": {
        const payload = data?.payload || result.targetEntity || data || {};
        const capURN = payload.capabilityURN || data?.capabilityURN || (result as any).capabilityURN || (data as any)?.result?.capabilityURN || (result as any).action?.payload?.capabilityURN || "";
        const provId = payload.providerId || data?.providerId || (result as any).providerId || (result as any).action?.payload?.providerId || "";
        const { CapabilityPresentationRegistry } = require("../external/presentation/CapabilityPresentationRegistry");
        const pres = CapabilityPresentationRegistry.getInstance().get(capURN as any);
        if (capURN.includes("playback") || capURN.includes("spotify") || provId === "spotify") {
          const resObj = data?.result || data || {};
          const isPlaying = resObj.isPlaying;
          const nowPlaying = resObj.nowPlaying;
          const itemType = resObj.itemType;
          const deviceName = resObj.deviceName ? ` on ${resObj.deviceName}` : "";

          if (resObj.command === "next" || resObj.command === "skip") {
            return `Skipped to the next track on Spotify${deviceName}.`;
          }

          if (resObj.command === "previous" || resObj.command === "prev") {
            return `Playing the previous track on Spotify${deviceName}.`;
          }

          if (isPlaying === false) {
            return `Paused Spotify playback${deviceName}.`;
          }

          if (resObj.command === "resume") {
            return `Resumed Spotify playback${deviceName}.`;
          }

          if (nowPlaying) {
            if (itemType === "artist") {
              return `Playing tracks by ${nowPlaying} on Spotify${deviceName}.`;
            }
            if (itemType === "playlist") {
              return `Playing playlist "${nowPlaying}" on Spotify${deviceName}.`;
            }
            if (itemType === "track") {
              return `Playing "${nowPlaying}" on Spotify${deviceName}.`;
            }
            return `Playing "${nowPlaying}" on Spotify${deviceName}.`;
          }

          return `Playing music on Spotify${deviceName}.`;
        }
        if (capURN.includes("read_events") || capURN.includes("calendar") || provId === "google_calendar") {
          const events = data?.result?.events || [];
          if (!Array.isArray(events) || events.length === 0) {
            return "You have nothing scheduled on your Google Calendar for today.";
          }
          const rows = events.map((e: any) => {
            const start = e.startTime ? new Date(e.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "All day";
            const end = e.endTime ? new Date(e.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
            const timeStr = end ? `${start} – ${end}` : start;
            const loc = e.location ? `\`${e.location}\`` : "—";
            return `| ${timeStr} | **${e.title || "Meeting"}** | ${loc} |`;
          }).join("\n");
          return `You have **${events.length}** event${events.length === 1 ? "" : "s"} scheduled:\n\n| Time | Event | Location |\n|:---|:---|:---|\n${rows}`;
        }
        if (capURN.includes("create_event")) {
          const title = payload.title || data?.title || "event";
          return `I've added "${title}" to your Google Calendar.`;
        }
        if (capURN.includes("email.send_message")) {
          const rawTo = payload.to || data?.to || payload?.parameters?.to;
          const toList = Array.isArray(rawTo) ? rawTo.filter(Boolean).join(", ") : (rawTo || "");
          const to = toList.trim() || "the recipient";
          return `I've sent that email to **${to}**.`;
        }
        if (capURN.includes("email.create_draft")) {
          const resObj = data?.result || data || {};
          const rawTo = resObj.to || payload.to || payload?.parameters?.to;
          const toList = Array.isArray(rawTo) ? rawTo.filter(Boolean).join(", ") : (rawTo || "");
          const toStr = toList.trim() ? `**To:** ${toList.trim()}  \n` : "";
          const subject = resObj.subject || payload.subject || payload?.parameters?.subject || "(No Subject)";
          const bodyText = (resObj.bodyText || payload.bodyText || payload?.parameters?.bodyText || "").trim();
          const bodyPreview = bodyText ? `\n\n---\n\n${bodyText}` : "";
          return `### ✉️ Email Draft Saved to Gmail\n${toStr}**Subject:** **${subject}**${bodyPreview}\n\n*Saved in your Gmail Drafts.*`;
        }
        if (capURN.includes("contacts.search_contacts")) {
          const resObj = data?.result || data || {};
          const contacts = resObj.contacts || [];
          if (contacts.length === 0) return "I searched your Google Contacts, but found no matching contacts.";
          const rows = contacts.slice(0, 15).map((c: any) => {
            const name = c.name || "Unnamed";
            const email = c.email || "—";
            const phone = c.phone || "—";
            return `| **${name}** | ${email} | ${phone} |`;
          }).join("\n");
          const footer = contacts.length > 15 ? `\n\n*Showing 15 of ${contacts.length} contacts.*` : "";
          return `I found **${contacts.length}** contact${contacts.length === 1 ? "" : "s"} in your Google Contacts:\n\n| Name | Email | Phone |\n|:---|:---|:---|\n${rows}${footer}`;
        }
        if (capURN.includes("contacts.get_contact")) {
          const c = data?.result?.contact || data?.contact || {};
          return `### 👤 Contact Details\n**Name:** **${c.name || "Contact"}**  \n**Email:** ${c.email || "—"}  \n**Phone:** ${c.phone || "—"}${c.company ? `  \n**Company:** ${c.company}` : ""}`;
        }
        if (capURN.includes("email.search_messages")) {
          const resObj = data?.result || data || {};
          const msgs = resObj.messages || [];
          if (msgs.length === 0) return "I checked your Gmail inbox, but found no emails matching your search.";

          if (msgs.length === 1) {
            const m = msgs[0];
            const cleanSender = m.from.replace(/<.*?>/, "").trim() || m.from;
            const senderAddress = m.from.includes("<") ? ` (${m.from.match(/<([^>]+)>/)?.[1] || ""})` : "";
            const dateStr = formatDate(m.date);
            return `### ✉️ Latest Email\n**From:** **${cleanSender}**${senderAddress}  \n**Date:** ${dateStr}  \n**Subject:** ${m.subject}\n\n> ${m.snippet || "(No preview snippet available)"}\n\n*Ask me to open this email or inspect its full contents.*`;
          }

          const rows = msgs.slice(0, 10).map((m: any, idx: number) => {
            const cleanSender = m.from.replace(/<.*?>/, "").replace(/"/g, "").trim() || "Unknown";
            const safeSubject = (m.subject || "(No subject)").replace(/\|/g, "-");
            const dateStr = formatDate(m.date);
            return `| ${idx + 1} | **${cleanSender}** | ${safeSubject} | ${dateStr} |`;
          }).join("\n");
          const footer = msgs.length > 10 ? `\n\n*Showing top 10 emails. Ask me to open any email by number (e.g. "open the first one") or filter by sender.*` : `\n\n*Ask me to open any email by number (e.g. "open the first one") or sender.*`;
          return `Found **${msgs.length}** email${msgs.length === 1 ? "" : "s"} in Gmail:\n\n| # | Sender | Subject | Date |\n|:---:|:---|:---|:---:|\n${rows}${footer}`;
        }
        if (capURN.includes("email.read_message") || capURN.includes("email.read_thread")) {
          const resObj = data?.result || data || {};
          const subject = resObj.subject || "(No Subject)";
          const from = resObj.from || "Unknown";
          const to = resObj.to ? `  \n**To:** ${resObj.to}` : "";
          const dateStr = resObj.date ? `  \n**Date:** ${formatDate(resObj.date)}` : "";

          if (resObj.isSummarized && resObj.summary) {
            return `### ✉️ Executive Summary: ${subject}\n**From:** **${from}**${dateStr}${to}\n\n---\n\n${resObj.summary}`;
          }

          const body = (resObj.bodyText || resObj.snippet || "*(This message contains no text content)*").trim();
          return `### ✉️ ${subject}\n**From:** **${from}**${dateStr}${to}\n\n---\n\n${body}`;
        }
        if (capURN.includes("task.sync_tasks")) {
          const resObj = data?.result || data || {};
          const tasks = resObj.tasks || [];
          if (tasks.length === 0) return "You have no pending tasks in Google Tasks.";
          const rows = tasks.map((t: any) => {
            const status = t.completed ? "✅ Complete" : "⏳ Pending";
            return `| ${status} | **${t.title}** |`;
          }).join("\n");
          return `Here are your current Google Tasks:\n\n| Status | Task |\n|:---:|:---|\n${rows}`;
        }
        if (capURN.includes("task.create_external")) {
          return "I've added that task to your external to-do list.";
        }
        if (capURN.includes("biometrics.read_daily_summary") || capURN.includes("health.activity.sync_telemetry")) {
          const resObj = data?.result || data || {};

          if (resObj.isRange && Array.isArray(resObj.dailyBreakdown) && resObj.dailyBreakdown.length > 0) {
            const totalSteps = typeof resObj.totalSteps === "number" ? resObj.totalSteps : 0;
            const avgSteps = typeof resObj.dailyAverage === "number" ? resObj.dailyAverage : Math.round(totalSteps / resObj.dailyBreakdown.length);
            const totalCalories = typeof resObj.totalCalories === "number" ? resObj.totalCalories : 0;
            const days = resObj.rangeDays || resObj.dailyBreakdown.length;

            const rows = resObj.dailyBreakdown.map((d: any) => {
              const s = typeof d.steps === "number" ? d.steps : 0;
              const c = typeof d.activeCalories === "number" ? d.activeCalories : 0;
              const goalStatus = s >= 10000 ? "🎯 Reached" : `${Math.round((s / 10000) * 100)}%`;
              return `| ${d.dayLabel || d.date} | ${d.date} | **${s.toLocaleString()}** | ${c} kcal | ${goalStatus} |`;
            }).join("\n");

            return `### 🏃 Activity Telemetry — Past ${days} Days (Google Fit)\n\n| Day | Date | Steps | Active Calories | Goal Progress |\n|:---|:---:|:---:|:---:|:---:|\n${rows}\n\n**Weekly Summary:**\n- 👟 **Total Steps:** **${totalSteps.toLocaleString()}** steps\n- 📊 **Daily Average:** **${avgSteps.toLocaleString()}** steps/day\n- 🔥 **Total Active Calories:** **${totalCalories.toLocaleString()}** kcal`;
          }

          const steps = typeof resObj.steps === "number" ? resObj.steps : 0;
          const calories = typeof resObj.activeCalories === "number" ? resObj.activeCalories : (resObj.activeCalories || 0);
          const stepGoal = 10000;
          const pct = Math.min(100, Math.round((steps / stepGoal) * 100));
          return `### 🏃 Today's Activity Telemetry (Google Fit)\n\n| Metric | Recorded Value | Target | Progress |\n|:---|:---:|:---:|:---:|\n| 👟 **Steps** | **${steps.toLocaleString()}** steps | 10,000 | ${pct}% |\n| 🔥 **Active Calories** | **${calories}** kcal | 500 kcal | ${calories > 0 ? "Active" : "Resting"} |\n\n${steps >= stepGoal ? "🎉 You've reached your daily step goal!" : `You're **${(stepGoal - steps).toLocaleString()}** steps away from your daily goal.`}`;
        }
        if (capURN.includes("biometrics.read_sleep")) {
          const resObj = data?.result || data || {};
          const hours = resObj.sleepMinutes ? (resObj.sleepMinutes / 60).toFixed(1) : "unknown";
          const score = resObj.sleepScore ? ` (Sleep Score: **${resObj.sleepScore}**/100)` : "";
          return `### 🌙 Sleep Telemetry (Google Fit)\n\nGoogle Fit recorded **${hours} hours** of sleep last night${score}.`;
        }
        if (capURN.includes("activity.record_workout")) {
          const wType = payload?.parameters?.workoutType || "workout";
          const dur = payload?.parameters?.durationMinutes || 30;
          return `I've logged your ${wType} (${dur} mins) in Google Fit.`;
        }
        if (capURN.includes("git.create_issue")) {
          const resObj = data?.result || data || {};
          const title = payload?.parameters?.title || "Issue";
          return `I've created issue #${resObj.issueNumber || 101} on GitHub: "${title}".`;
        }
        if (capURN.includes("git.list_repos")) {
          const resObj = data?.result || data || {};
          const repos = resObj.repositories || [];
          if (repos.length === 0) return "I checked your GitHub account, but found no repositories.";
          const rows = repos.slice(0, 15).map((r: any) => {
            const vis = r.isPrivate ? "🔒 Private" : "🌐 Public";
            const lang = r.language ? `\`${r.language}\`` : "—";
            return `| **${r.name}** | ${vis} | ${lang} |`;
          }).join("\n");
          return `Here are your GitHub repositories:\n\n| Repository | Visibility | Language |\n|:---|:---:|:---:|\n${rows}`;
        }
        if (capURN.includes("list_prs")) {
          const resObj = data?.result || data || {};
          const prs = resObj.pullRequests || [];
          if (prs.length === 0) return "No open pull requests found on GitHub.";
          const rows = prs.map((p: any) => `| #${p.number} | **${p.title}** | @${p.author} |`).join("\n");
          return `Here are your open pull requests on GitHub:\n\n| PR # | Title | Author |\n|:---:|:---|:---|\n${rows}`;
        }
        if (capURN.includes("storage.list_files")) {
          const resObj = data?.result || data || {};
          const files = resObj.files || [];
          const ext = resObj.extension ? ` ${resObj.extension}` : "";
          const dir = String(resObj.searchDirectory || payload?.parameters?.path || "").trim();

          if (provId === "google_drive" || dir === "Google Drive") {
            if (files.length === 0) return `I checked your Google Drive, but found no${ext} files.`;
            const rows = files.slice(0, 15).map((f: any) => {
              const name = f.name;
              const type = getHumanFileType(f.mimeType, name);
              const size = formatBytes(f.sizeBytes);
              const mod = formatDate(f.modifiedTime);
              return `| **${name}** | ${type} | ${size} | ${mod} |`;
            }).join("\n");
            const footer = files.length > 15 ? `\n\n*Showing top 15 of ${files.length} files. Ask me to search by name or inspect any file.*` : "";
            return `I found **${files.length}**${ext} file${files.length === 1 ? "" : "s"} in your Google Drive:\n\n| File Name | Type | Size | Modified |\n|:---|:---|:---:|:---:|\n${rows}${footer}`;
          }

          if (provId === "obsidian_vault" || dir.toLowerCase().includes("obsidian")) {
            if (files.length === 0) return "I checked your Obsidian vault, but found no notes.";
            const rows = files.slice(0, 15).map((f: any) => `| **${f.name}** | Note |`).join("\n");
            return `I found **${files.length}** note${files.length === 1 ? "" : "s"} in your Obsidian vault:\n\n| Note Name | Type |\n|:---|:---|\n${rows}`;
          }

          if (provId === "notion" || dir.toLowerCase().includes("notion")) {
            if (files.length === 0) return "I checked your Notion workspace, but found no items.";
            const rows = files.slice(0, 15).map((f: any) => `| **${f.name}** | Page |`).join("\n");
            return `I found **${files.length}** item${files.length === 1 ? "" : "s"} in your Notion workspace:\n\n| Item Name | Type |\n|:---|:---|\n${rows}`;
          }

          let location = "on your desktop";
          if (dir.toLowerCase() === "desktop") {
            location = "on your desktop";
          } else if (dir.toLowerCase() === "downloads") {
            location = "in your Downloads folder";
          } else if (dir.toLowerCase() === "documents") {
            location = "in your Documents folder";
          } else if (dir.startsWith("D:") || dir.startsWith("d:") || dir.toLowerCase().includes("d drive")) {
            location = "on your D drive";
          } else if (dir.startsWith("C:") || dir.startsWith("c:") || dir.toLowerCase().includes("c drive")) {
            location = "on your C drive";
          } else if (dir) {
            location = `in ${dir}`;
          }

          const reqType = String(payload?.parameters?.type || payload?.parameters?.itemType || "").toLowerCase();
          const isFolders = reqType === "folder" || reqType === "directory" || (files.length > 0 && files.every((f: any) => f.isDirectory));
          const noun = isFolders ? "folder" : "file";

          if (files.length === 0) {
            return `I checked ${location}, but there are no${ext} ${noun}s.`;
          }
          const rows = files.slice(0, 15).map((f: any) => {
            const type = f.isDirectory ? "Folder" : getHumanFileType(f.mimeType, f.name);
            const size = f.sizeBytes ? formatBytes(f.sizeBytes) : "—";
            return `| **${f.name}** | ${type} | ${size} |`;
          }).join("\n");
          const footer = files.length > 15 ? `\n\n*Showing top 15 of ${files.length} ${noun}s.*` : "";
          return `I found **${files.length}**${ext} ${noun}${files.length === 1 ? "" : "s"} ${location}:\n\n| Name | Type | Size |\n|:---|:---|:---:|\n${rows}${footer}`;
        }
        if (capURN.includes("storage.read_file")) {
          const resObj = data?.result || data || {};
          const fileName = resObj.fileName || require("path").basename(payload?.parameters?.path || payload?.path || "file");
          
          if (resObj.isSummarized && resObj.summary) {
            return `### 📄 Executive Summary: ${fileName}\n\n${resObj.summary.trim()}`;
          }

          const content = String(resObj.content || "").trim();
          if (!content) {
            return `I opened "${fileName}", but the file appears to be empty.`;
          }

          const fileType = getHumanFileType(resObj.mimeType, fileName);
          const sizeStr = resObj.sizeBytes ? ` • ${formatBytes(resObj.sizeBytes)}` : "";
          const header = `### 📄 ${fileName}\n> **Type:** ${fileType}${sizeStr}\n\n---\n\n`;

          if (content.length > 4000) {
            const preview = content.slice(0, 4000);
            return `${header}${preview}\n\n---\n\n*(Document continues... Ask me to summarize it or look for specific details.)*`;
          }
          return `${header}${content}`;
        }
        if (capURN.includes("storage.write_file")) {
          const resObj = data?.result || data || {};
          const filePath = resObj.path || payload?.parameters?.path || payload?.path || "your file";
          const fileName = require("path").basename(filePath);

          if (provId === "obsidian_vault" || filePath.toLowerCase().includes("obsidian")) {
            return `I've created and saved ${fileName} in your Obsidian vault.`;
          }
          if (provId === "notion") {
            return `I've created the page "${fileName}" in your Notion workspace.`;
          }

          let location = "on your desktop";
          if (filePath.toLowerCase().includes("desktop")) {
            location = "on your desktop";
          } else if (filePath.toLowerCase().includes("downloads")) {
            location = "in your Downloads folder";
          } else if (filePath.toLowerCase().includes("documents")) {
            location = "in your Documents folder";
          } else if (filePath.startsWith("D:") || filePath.startsWith("d:")) {
            location = "on your D drive";
          } else if (filePath.startsWith("C:") || filePath.startsWith("c:")) {
            location = "on your C drive";
          }
          return `I've created and saved ${fileName} ${location}.`;
        }
        if (capURN.includes("open_url")) {
          const resObj = data?.result || data || {};
          const url = resObj.url || payload.url || "the website";
          return `I've opened ${url} in your browser.`;
        }
        if (capURN.includes("read_weather")) {
          const resObj = data?.result || data || {};
          const loc = resObj.location || "your location";
          const temp = resObj.temperature ?? 24;
          const apparent = resObj.apparentTemperature ?? temp;
          const desc = resObj.weatherDescription || "Clear";
          const hum = resObj.humidity ?? 50;
          const wind = resObj.windSpeed ?? 10;
          return `### 🌤️ Weather in ${loc}\n\n| Condition | Temperature | Feels Like | Humidity | Wind |\n|:---|:---:|:---:|:---:|:---:|\n| **${desc}** | **${temp}°C** | ${apparent}°C | ${hum}% | ${wind} km/h |\n\n*Telemetry sourced live from Open-Meteo.*\n*Ask me for a 7-day forecast if you're planning ahead.*\n`;
        }
        if (capURN.includes("get_forecast")) {
          const resObj = data?.result || data || {};
          const loc = resObj.location || "your location";
          const list = resObj.forecast || [];
          const rows = list.slice(0, 7).map((d: any) => `| ${d.date} | **${d.weatherDescription}** | ${d.maxTemp}°C / ${d.minTemp}°C | ${d.precipitationProb}% |`).join("\n");
          return `### 📅 7-Day Forecast for ${loc}\n\n| Date | Condition | High / Low | Rain Chance |\n|:---|:---|:---:|:---:|\n${rows}\n\n*Live open-source meteorological forecast via Open-Meteo.*\n`;
        }
        if (capURN.includes("itinerary.generate")) {
          const resObj = data?.result || data || {};
          const dest = resObj.destination || "your destination";
          const days = resObj.durationDays || 3;
          const summary = resObj.summary || "";
          const plans = (resObj.dailyPlan || []).map((dp: any) => {
            const acts = (dp.activities || []).map((a: string) => `- ${a}`).join("\n");
            return `#### ${dp.title}\n${acts}`;
          }).join("\n\n");
          return `### 🧳 Curated ${days}-Day Itinerary: ${dest}\n\n>${summary}\n\n${plans}\n\n*Powered by OpenStreetMap & Wikivoyage.*\n*Would you like me to block these on your Google Calendar?*\n`;
        }
        if (capURN.includes("flights.search")) {
          const resObj = data?.result || data || {};
          const orig = resObj.origin || "Origin";
          const dest = resObj.destination || "Destination";
          const depDate = resObj.departureDate || "";
          const flights = resObj.flights || [];
          const rows = flights.map((f: any) => `| **${f.airline}** | ${f.departureTime} → ${f.arrivalTime} | ${f.duration} (${f.stops === 0 ? "Direct" : f.stops + " stop"}) | [${f.price}](${f.bookingUrl}) |`).join("\n");
          return `### ✈️ Flights: ${orig} → ${dest} (${depDate})\n\n| Route / Airline | Schedule | Duration | Fare & Booking |\n|:---|:---:|:---:|:---:|\n${rows}\n\n👉 [Open Full Flights Search & Real-Time Fares](${resObj.bookingUrl})\n`;
        }
        if (capURN.includes("hotels.search")) {
          const resObj = data?.result || data || {};
          const loc = resObj.location || "your destination";
          const hotels = resObj.hotels || [];
          const rows = hotels.map((h: any) => `| **${h.name}** | ${"★".repeat(h.stars || 4)} | ${h.address || loc} | [View Deals](${h.bookingUrl}) |`).join("\n");
          return `### 🏨 Accommodations in ${loc}\n\n| Hotel / Stay | Rating | Location | Booking Link |\n|:---|:---:|:---|:---:|\n${rows}\n\n👉 [Compare All Stays on Google Hotels](${resObj.searchUrl})\n`;
        }
        if (capURN.includes("shopping.products.search")) {
          const resObj = data?.result || data || {};
          const q = resObj.query || "Product";
          const products = resObj.products || [];
          const rows = products.map((p: any) => `| **${p.title}** | ${p.platform} | ${p.rating || "Top Rated"} | [View Product & Deals](${p.productUrl}) |`).join("\n");
          return `### 🛒 Product Search & Price Comparison: "${q}"\n\n| Product | Retailer | Rating | Buy Direct |\n|:---|:---:|:---:|:---:|\n${rows}\n\n*Click any retailer link to view live inventory and coupons.*\n`;
        }
        if (capURN.includes("shopping.cart.add")) {
          const resObj = data?.result || data || {};
          return `### 🛒 Product Ready for Purchase\n\n${resObj.message || "Product ready for secure purchase."}\n\n👉 [Proceed to Secure Checkout](${resObj.checkoutUrl})\n`;
        }
        return pres.completedPhrase ? `Done: ${pres.completedPhrase}.` : "Action completed successfully.";
      }

      default: {
        const noun = cap?.verbalization?.entityNoun || "item";
        const verb = cap?.verbalization?.actionVerbPast || "processed";
        const title = data?.title || data?.name || noun;
        return `I've ${verb} "${title}".`;
      }
    }
  }

  private formatFailure(result: KernelExecutionResult): string {
    const err = result.error || "";

    if (result.actionType === "external_capability_action") {
      const payload = (result as any).payload || (result as any).data || {};
      const capURN = payload.capabilityURN || (result as any).data?.capabilityURN || (result as any).action?.payload?.capabilityURN || "";
      const provId = payload.providerId || (result as any).data?.providerId || (result as any).action?.payload?.providerId || "";
      const { CapabilityPresentationRegistry } = require("../external/presentation/CapabilityPresentationRegistry");
      const pres = CapabilityPresentationRegistry.getInstance().get(capURN as any, provId);
      const provName = (pres && pres.providerDisplayName !== "Service") ? pres.providerDisplayName : (provId === "spotify" ? "Spotify" : "External service");

      if (err.includes("AUTH_NOT_CONFIGURED") || err.includes("reconnect") || err.includes("auth") || err.includes("expired") || err.includes("valid access token")) {
        return `I can't access ${provName} because the session has expired or is missing credentials. Please reconnect in Settings > Connections.`;
      }
      if (err.includes("No active") || err.includes("player found") || err.includes("device")) {
        return `I reached ${provName}, but no active playback device was found. Please open Spotify on your phone, PC, or web player first, then ask me again.`;
      }
      if (err.includes("Premium") || err.includes("premium")) {
        return "Spotify Web API playback control requires an active Spotify Premium subscription.";
      }
      if (err.includes("UNKNOWN_EXTERNAL_STATE") || err.includes("timeout")) {
        return `${provName} isn't responding right now. I haven't made any changes.`;
      }
      if (err.includes("permission") || err.includes("forbidden") || err.includes("denied")) {
        return `Aven doesn't currently have permission to do that in ${provName}.`;
      }
      return `I couldn't control ${provName}: ${err}`;
    }

    // Clean duplicate conflict prompts
    if (err.includes("CONFLICT_REQUIRES_CLARIFICATION:")) {
      return err.replace(/^CONFLICT_REQUIRES_CLARIFICATION:\s*/, "");
    }

    if (err.includes("DUPLICATE_DETECTED:")) {
      return err.replace(/^DUPLICATE_DETECTED:\s*/, "");
    }

    // Clean missing entity errors into natural clarification requests
    if (err.includes("taskId is required") || err.includes("Target entity")) {
      return "Which task would you like me to update?";
    }

    if (err.includes("goalId is required")) {
      return "Which goal are you referring to?";
    }

    if (err.includes("sessionId is required")) {
      return "Which workout session would you like to update?";
    }

    if (err) {
      if (
        result.actionType.includes("occurrence") ||
        result.actionType.includes("series") ||
        result.actionType.includes("temporal")
      ) {
        if (
          err.includes("validation failed") ||
          err.includes("is required") ||
          err.includes("Path `") ||
          err.includes("Cast to") ||
          err.includes("Mongo") ||
          err.includes("Template")
        ) {
          return "I wasn't able to schedule that. Could you confirm the start time or dates?";
        }
        return "I wasn't able to complete that schedule update. Could you clarify the details?";
      }

      return `I couldn't complete ${result.actionType.replace("_", " ")}: ${err}`;
    }

    const cap = DOMAIN_CAPABILITIES[result.actionType];
    const noun = cap?.verbalization?.entityNoun || "request";
    return `I wasn't able to complete that ${noun}. Could you clarify the details?`;
  }
}
