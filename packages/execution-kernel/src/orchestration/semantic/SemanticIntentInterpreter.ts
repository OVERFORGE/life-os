import * as crypto from "crypto";
import { groqChat, cleanLLMResponse } from "../../shared/groq";
import { generateId } from "../../shared/ids";
import {
  SemanticTurn,
  SemanticOperation,
  TurnPrimaryClassification,
  AmbiguityStatus,
  SomaticAffectiveEvidence,
  OperationRiskClass,
  isOperationExecutable,
  IContextEntityRef,
  IPendingOperationContext,
} from "../contracts/SemanticTurnContracts";
import { DomainActionType, DOMAIN_CAPABILITIES } from "../contracts/ActionProposalContracts";
import { resolveTemporalExpression, resolveStructuredTemporal } from "./temporalResolver";
import { getActiveDate } from "../../automation/timeUtils";
import { minutesToTimeString } from "../../temporal/normalization/temporalNormalizer";
import { NutritionEstimator } from "../../nutrition/nutritionEstimator";

export interface SemanticInterpreterContext {
  userId: string;
  conversationId?: string;
  timezone?: string;
  referenceTimeMs?: number;
  knownTasks?: Array<{ id: string; title: string }>;
  activeMode?: string;
  activeIncidents?: string[];
  recentHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  activeFocus?: IContextEntityRef | null;
  recentEntities?: IContextEntityRef[];
  pendingOperation?: IPendingOperationContext | {
    operationId: string;
    actionType: DomainActionType;
    clarificationQuestion: string;
    missingRequirement: string | { kind: string; targetEntityType?: string; parameterName?: string };
    candidateEntities?: Array<{ entityId: string; displayName: string; temporalAnchor?: string }>;
    state?: string;
    partialPayload?: Record<string, any>;
    domain?: string;
  } | null;
}

const SYSTEM_PROMPT_V2 = `You are Aven, cognitive chief of staff and semantic intent interpreter for LifeOS.
Translate human natural language into a canonical, structured SemanticTurn JSON with domain operations.

CRITICAL INVARIANTS:
1. MEDIA & SPOTIFY PLAYBACK:
   ANY request asking to play, pause, resume, or skip music, songs, artists, playlists, sounds, or white noise MUST ALWAYS be classified as "ACTION_REQUEST" with actionType "external_capability_action" and capabilityURN "wellness.media.playback_control". NEVER classify as "CASUAL_DIALOGUE" or return 0 operations.
   - Playing: { "capabilityURN": "wellness.media.playback_control", "providerId": "spotify", "parameters": { "command": "play", "query": "<query>", "targetType": "track"|"artist"|"playlist"|"auto" } }
     - Specific song ("play cold water by justin bieber", "play brown rang by honey singh", "play blinding lights") -> targetType: "track", query: song or song with artist
     - Artist alone ("play taylor swift", "play the weeknd", "play weeknd") -> targetType: "artist", query: artist name
     - Playlist, ambient sound, white noise, mood ("play my workout playlist", "play white noise", "play playlist with the name calm", "play calm music") -> targetType: "playlist", query: playlist/sound name ("workout", "white noise", "calm")
   - Pausing ("pause", "pause it", "okay pause it", "can you pause the song now", "stop playback") -> parameters: { "command": "pause" }
   - Resuming ("resume", "unpause", "continue music") -> parameters: { "command": "resume" }
   - Skipping ("skip", "next song", "next track") -> parameters: { "command": "next" }

2. PRODUCTIVITY & TASKS:
   - Tasks / to-dos ("Finish deck tomorrow", "Review PR") -> actionType: "create_task", payload: { "title": "Finish deck", "dueDate": "tomorrow" }
   - "Finished deck" / "done with deck" -> actionType: "complete_task", targetReference: { "kind": "DESCRIPTIVE", "semanticDescriptor": "deck" }
   - "Set priority to high" -> adjust_task_priority, payload: { "priority": "high" }

3. HABITS VS TASKS:
   - Ongoing habits, daily routines -> actionType: "propose_goal", payload: { "title": "...", "cadence": "daily" }

4. CALENDAR & ROUTINE TIME-BLOCKING:
   - Checking calendar / schedule ("what do I have left today", "what's on my schedule today", "tell me what I have left", "check my meetings", "fetch the latest updates from my google calendar") -> capabilityURN: "productivity.calendar.read_events", providerId: "google_calendar", parameters: {}
   - Calendar meetings / events / appointments ("schedule a meeting with Alex tomorrow at 3", "add team sync to calendar") -> capabilityURN: "productivity.calendar.create_event", providerId: "google_calendar", parameters: { "title": "Meeting with Alex", "startTime": "...", "endTime": "..." }
   - Recurring classes/routines ("university Monday 1:40pm to 4:10pm") -> actionType: "create_temporal_series", payload: { "title": "University classes", "kind": "HARD_EVENT"|"ROUTINE_BLOCK", "baseStartTime": "13:40", "baseDurationMinutes": 150, "locationCategory": "ACADEMIC"|"GYM", "recurrence": { "frequency": "WEEKLY", "interval": 1, "daysOfWeek": [1], "effectiveStartDate": "YYYY-MM-DD" } }
   - Commute/transit buffers -> create_temporal_series with kind: "TRANSITION_BUFFER"
   - Attended/logged session ("went to uni from 11:10 to 12:50") -> log_execution_interval
   - Skipped session ("skipped class today", "cancelled gym") -> cancel_occurrence with status: "SKIPPED"

5. CONVERSATIONAL CLARIFICATION, COREFERENCE & FOLLOW-UPS:
   - Affirmative confirmation ("yes", "yea", "sure", "do it", "allow", "go ahead", "okay", "yes confirm") -> ALWAYS classify as "CONFIRMATION" when any pending operation exists.
   - Negative / cancellation ("no", "cancel", "deny", "stop", "don't do that") -> ALWAYS classify as "CANCEL_OR_DISMISS".
   - Anaphoric follow-up queries: When the user asks to see, list, or inspect items discussed in recent history ("and what are they", "list them", "show them", "what are their names", "show me those folders"):
     Resolve the target from recent conversation history. For example, if the previous turn discussed folders or files on a drive or directory (e.g. "D drive", "D:\\"), produce an "ACTION_REQUEST" with "productivity.storage.list_files" for that same directory or drive path.
   - Never classify anaphoric queries asking for details of items from the previous turn as CASUAL_DIALOGUE.
   - Recall prior details from recent conversation history; never re-ask what the user already stated.

6. STRICT ZERO OPERATIONS:
   - Gratitude / compliments ("thank you", "you're a lifesaver") -> CASUAL_DIALOGUE, operations: []
   - Conversational sign-offs ("let's talk tomorrow, signing off") -> CASUAL_DIALOGUE, operations: []
   - General greetings / trivia ("hello", "what is the capital of France") -> CASUAL_DIALOGUE, operations: []

8. LOCAL FILESYSTEM & STORAGE:
   ANY request asking to inspect, list, find, or search files or folders on the user's desktop, downloads, project directories, local drives (C:, D:), or local computer, or read/write local files MUST be classified as "ACTION_REQUEST" with actionType "external_capability_action" and providerId "filesystem_desktop". NEVER invent "local_os" or unregistered provider IDs.
   - Listing / searching files ("go to my desktop and see if i have any .py file", "find python files on my desktop", "list files in downloads"):
     { "capabilityURN": "productivity.storage.list_files", "providerId": "filesystem_desktop", "parameters": { "path": "Desktop", "extension": ".py" }, "requiresConfirmation": false }
   - Drives and folders ("check my D drive and lmk how many folders are there", "what folders are in D:"):
     { "capabilityURN": "productivity.storage.list_files", "providerId": "filesystem_desktop", "parameters": { "path": "D:\\", "type": "folder" }, "requiresConfirmation": false }
   - Reading files ("read my notes.txt file"):
     { "capabilityURN": "productivity.storage.read_file", "providerId": "filesystem_desktop", "parameters": { "path": "notes.txt" }, "requiresConfirmation": false }
   - Writing / creating files ("create a python file with code of palindrome on my desktop", "save code to Desktop/palindrome.py"):
     Always generate complete, high-quality code or text content in the "content" parameter.
     { "capabilityURN": "productivity.storage.write_file", "providerId": "filesystem_desktop", "parameters": { "path": "Desktop/palindrome.py", "content": "..." }, "requiresConfirmation": true, "confirmationMode": "EXPLICIT_CONFIRMATION" }

9. BROWSER & SYSTEM ACTIONS:
   ANY request asking to open a browser, navigate to a website or domain, or launch a URL ("open my browser and go to amazon.com", "open youtube.com", "go to github.com in my browser") MUST be classified as "ACTION_REQUEST" with actionType "external_capability_action", providerId "filesystem_desktop", and capabilityURN "context.system.open_url".
   - Opening URL / Website:
     { "capabilityURN": "context.system.open_url", "providerId": "filesystem_desktop", "parameters": { "url": "https://amazon.com" }, "requiresConfirmation": false }

10. GOOGLE WORKSPACE (DRIVE, GMAIL, CALENDAR, CONTACTS, TASKS, FIT & NOTES):
   - Google Drive list / search ("can you check my google drive ?", "search my google drive for slides", "list files in drive"):
     { "capabilityURN": "productivity.storage.list_files", "providerId": "google_drive", "parameters": { "path": "Google Drive", "pattern": "" }, "requiresConfirmation": false }
   - Google Drive file filtering by type or extension ("can you check if there's any pdf file on my google drive ?", "find pdfs on drive", "find spreadsheets on drive"):
     { "capabilityURN": "productivity.storage.list_files", "providerId": "google_drive", "parameters": { "path": "Google Drive", "extension": "pdf", "type": "pdf" }, "requiresConfirmation": false }
   - Google Drive read file ("read this file on my google drive and let me know what's written in there", "can you read resume.pdf on drive"):
     { "capabilityURN": "productivity.storage.read_file", "providerId": "google_drive", "parameters": { "path": "<exact file name or path>" }, "requiresConfirmation": false }
   - Google Drive summarize file ("can you summarize this file?", "okay summarize it", "summarize Specialized_resume_founder_office_daksh_kaushal.pdf"):
     Resolve file name from recent history if unspecified: { "capabilityURN": "productivity.storage.read_file", "providerId": "google_drive", "parameters": { "path": "<exact file name from recent context>", "intent": "summarize" }, "requiresConfirmation": false }
   - Google Notes / Docs ("can you find my latest notes on google notes", "check notes in google"):
     Always use google_drive storage for Google documents and notes: { "capabilityURN": "productivity.storage.list_files", "providerId": "google_drive", "parameters": { "path": "Google Drive", "pattern": "notes" }, "requiresConfirmation": false }. NEVER emit "google_notes" or "google_keep".
   - Google Contacts ("can you access google contacts", "list down my contacts from google contact", "search my contacts for Alex"):
     Listing address book: { "capabilityURN": "productivity.contacts.search_contacts", "providerId": "google_contacts", "parameters": { "query": "" }, "requiresConfirmation": false }
     Searching a person: { "capabilityURN": "productivity.contacts.search_contacts", "providerId": "google_contacts", "parameters": { "query": "Alex" }, "requiresConfirmation": false }
   - Gmail search / recent inbox ("check my last 10 email", "check my last 10 mails", "what was my last mail on my gmail", "check my email", "search my inbox for flight"):
     For general inbox checks ("last 10 emails", "my emails"): set query: "" and maxResults: 10.
     For singular last email ("what was my last mail"): set query: "" and maxResults: 1.
     For keyword search ("emails from Sarah", "flight"): set query: "from:Sarah" or "flight".
     { "capabilityURN": "productivity.email.search_messages", "providerId": "gmail", "parameters": { "query": "...", "maxResults": 10 }, "requiresConfirmation": false }
   - Gmail open / read message ("open the last mail that came from HDFC bank and tell me what's written inside it", "open the first one out of this", "open the first one", "read the second email"):
     When user asks to open/read/inspect the body of an email:
     { "capabilityURN": "productivity.email.read_message", "providerId": "gmail", "parameters": { "query": "from:HDFC", "sender": "HDFC", "index": 0 }, "requiresConfirmation": false }
     When opening by ordinal from recent turn ("open the first one", "read the first email"):
     { "capabilityURN": "productivity.email.read_message", "providerId": "gmail", "parameters": { "index": 0 }, "requiresConfirmation": false }
   - Gmail summarize email ("can you summarize this email for me?", "summarize this mail", "give me a summary of the Wellfound email"):
     When user asks to summarize an email:
     { "capabilityURN": "productivity.email.read_message", "providerId": "gmail", "parameters": { "intent": "summarize", "summarize": true }, "requiresConfirmation": false }
     If referring to an email from recent dialogue, resolve query or sender from context.
   - Gmail draft email ("can you draft me a mail to hire a co founder", "draft an email to pitch our product", "write a draft for a partnership"):
     Creating a draft in Gmail is completely non-destructive (the user can edit or delete it anytime). NEVER map drafting to send_message! Compose a complete, professional subject and bodyText:
     { "capabilityURN": "productivity.email.create_draft", "providerId": "gmail", "parameters": { "subject": "...", "bodyText": "..." }, "requiresConfirmation": false }
   - Gmail send ("send an email to alex@example.com", "mail it to alex@example.com", "now mail this", "mail it to overforgegaming@gmail.com"):
     When the user instructs sending an email (or says "mail it to ...", "now mail this"):
     - If referring to a draft or email composed in previous turns, extract the subject and bodyText from the conversation context, apply any requested revisions (e.g. sender name "Daksh"), and emit:
     { "capabilityURN": "productivity.email.send_message", "providerId": "gmail", "parameters": { "to": ["alex@example.com"], "subject": "...", "bodyText": "..." }, "requiresConfirmation": true, "confirmationMode": "EXPLICIT_CONFIRMATION" }
     - NEVER re-output the email draft in plain text instead of emitting the send operation! The Human-in-the-Loop gate will handle confirmation automatically.
   - Google Tasks ("sync my google tasks", "what are my google tasks"):
     { "capabilityURN": "productivity.task.sync_tasks", "providerId": "google_tasks", "requiresConfirmation": false }
   - Google Fit telemetry:
     - Multi-day / Weekly step count ("can you check my steps taken from google fit for last one week", "steps from google fit for last week", "my activity for past 7 days"):
       { "capabilityURN": "health.biometrics.read_daily_summary", "providerId": "google_fit", "parameters": { "days": 7, "range": "last_7_days" }, "requiresConfirmation": false }
     - Single day ("check my google fit", "can you check my today's steps i took from my google fit", "how many steps did i walk today"):
       { "capabilityURN": "health.biometrics.read_daily_summary", "providerId": "google_fit", "parameters": { "date": "today", "days": 1 }, "requiresConfirmation": false }
     - Sleep ("check my sleep in google fit"):
       { "capabilityURN": "health.biometrics.read_sleep", "providerId": "google_fit", "parameters": { "date": "today" }, "requiresConfirmation": false }
   - Google Fit record workout ("log a 30 min run in google fit"):
     { "capabilityURN": "health.activity.record_workout", "providerId": "google_fit", "parameters": { "workoutType": "Running", "durationMinutes": 30 }, "requiresConfirmation": true, "confirmationMode": "EXPLICIT_CONFIRMATION" }

11. GITHUB, NOTION & OBSIDIAN VAULT:
   - GitHub Repositories ("can you access my github", "check my github", "can you check all my repositories", "list down my last 10 github repositories", "list my repositories", "show my repos"):
     { "capabilityURN": "productivity.git.list_repos", "providerId": "github", "parameters": { "per_page": 10 }, "requiresConfirmation": false }
   - GitHub PRs & code ("check my github PRs", "list open pull requests"):
     { "capabilityURN": "productivity.git.list_prs", "providerId": "github", "parameters": {}, "requiresConfirmation": false }
   - GitHub create issue ("create an issue on github for bug"):
     { "capabilityURN": "productivity.git.create_issue", "providerId": "github", "parameters": { "owner": "...", "repo": "...", "title": "..." }, "requiresConfirmation": true, "confirmationMode": "EXPLICIT_CONFIRMATION" }
   - Notion ("check my notion", "search my notion notes"):
     { "capabilityURN": "productivity.storage.list_files", "providerId": "notion", "parameters": { "pattern": "..." }, "requiresConfirmation": false }
   - Notion create page ("create a notion page for project"):
     { "capabilityURN": "productivity.storage.write_file", "providerId": "notion", "parameters": { "path": "Project Notes", "content": "..." }, "requiresConfirmation": true, "confirmationMode": "EXPLICIT_CONFIRMATION" }
   - Obsidian Vault ("check my obsidian vault", "search my obsidian notes for AI", "list notes in my obsidian vault"):
     { "capabilityURN": "productivity.storage.list_files", "providerId": "obsidian_vault", "parameters": { "pattern": "" }, "requiresConfirmation": false }
   - Obsidian write note ("create a note in obsidian about neural nets"):
     { "capabilityURN": "productivity.storage.write_file", "providerId": "obsidian_vault", "parameters": { "path": "neural nets.md", "content": "..." }, "requiresConfirmation": true, "confirmationMode": "EXPLICIT_CONFIRMATION" }

12. ZERO-CONFIG SERVICES (WEATHER, TRAVEL, FLIGHTS, HOTELS, SHOPPING):
   - Live Weather ("what's the weather like today", "how is the weather in Tokyo", "is it going to rain in London"):
     { "capabilityURN": "context.environment.read_weather", "providerId": "open_meteo", "parameters": { "location": "Tokyo" }, "requiresConfirmation": false }
     If user does NOT specify a city ("what's the weather today?", "is it going to rain today?"), set location to "" or omit it — the kernel auto-detects the user's location.
   - 7-Day Forecast ("give me the 7 day forecast for Paris", "weather forecast for New York", "AQI and weather for next 7 days in Kapurthala"):
     { "capabilityURN": "context.environment.get_forecast", "providerId": "open_meteo", "parameters": { "location": "Paris", "days": 7 }, "requiresConfirmation": false }
   - Travel Itinerary ("plan a 3-day trip to Rome", "i'm planning to visit delhi for 2 days can you plan a small trip for me", "itinerary for Goa"):
     { "capabilityURN": "travel.itinerary.generate", "providerId": "openstreetmap_travel", "parameters": { "destination": "Delhi", "durationDays": 2 }, "requiresConfirmation": false }
   - Travel Attractions & Places ("places to visit in Kyoto", "attractions in Barcelona"):
     { "capabilityURN": "travel.places.search", "providerId": "openstreetmap_travel", "parameters": { "location": "Kyoto" }, "requiresConfirmation": false }
   - Flight Tickets ("can you check for the best flight from delhi to patna tomorrow", "find flights from New York to London", "search flights from Delhi to Mumbai"):
     ALWAYS map ANY flight query, ticket search, or airline schedule request to:
     { "capabilityURN": "travel.flights.search", "providerId": "flight_tracker", "parameters": { "origin": "Delhi", "destination": "Patna", "departureDate": "tomorrow" }, "requiresConfirmation": false }
   - Hotel Booking ("can you check for hotels in delhi near the new delhi railway station for three days tomorrow onwards", "search hotels in Paris", "find places to stay in Tokyo"):
     ALWAYS map ANY hotel, stay, or accommodation query to:
     { "capabilityURN": "travel.hotels.search", "providerId": "hotel_finder", "parameters": { "location": "Delhi near New Delhi Railway Station", "checkInDate": "tomorrow" }, "requiresConfirmation": false }
   - Automated Shopping & Price Comparison ("can you find best price for a PS5 gaming controller", "find best prices for Sony headphones", "compare prices for Macbook Air"):
     { "capabilityURN": "shopping.products.search", "providerId": "shopping_agent", "parameters": { "query": "PS5 gaming controller" }, "requiresConfirmation": false }
   - Shopping Cart / Buy Assist ("add it to my shopping cart on my amazon id", "buy it for me", "order the first one for me"):
     { "capabilityURN": "shopping.cart.add", "providerId": "shopping_agent", "parameters": { "productUrl": "https://www.amazon.in/s?k=PS5+controller" }, "requiresConfirmation": false }
   - Shopping Cart & Browser Purchase Assist ("add it to my shopping cart on my amazon id", "buy it for me", "order the first one for me", "buy the PS5 controller on Amazon"):
     ALWAYS map ANY autonomous purchasing, cart adding, or buying intent to:
     { "capabilityURN": "shopping.browser.search_and_cart", "providerId": "aven_browser_agent", "parameters": { "productName": "PS5 gaming controller", "store": "amazon", "action": "add_to_cart" }, "requiresConfirmation": false }
   - Mobility & Rides ("book a cab to airport", "check uber to railway station", "find rides to Chandigarh", "how much is an uber or ola to Delhi"):
     ALWAYS map ANY ride, cab, taxi, or mobility query to:
     { "capabilityURN": "mobility.rides.estimate", "providerId": "uber_mobility", "parameters": { "pickup": "", "dropoff": "Chandigarh Airport" }, "requiresConfirmation": false }
   - Food Delivery ("order butter chicken from zomato", "find good restaurants nearby", "order food from swiggy", "check pizza places"):
     ALWAYS map ANY restaurant search or food delivery order to:
     { "capabilityURN": "commerce.food.search_restaurants", "providerId": "zomato_eats", "parameters": { "query": "butter chicken", "location": "" }, "requiresConfirmation": false }
   - Quick Commerce (10-minute groceries, essentials) ("order milk and bread from zepto", "get eggs from blinkit", "instamart groceries", "order snacks in 10 mins"):
     ALWAYS map ANY 10-minute grocery or essentials request to:
     { "capabilityURN": "commerce.quick.search_catalog", "providerId": "zepto_commerce", "parameters": { "query": "milk and bread" }, "requiresConfirmation": false }
   - Quick Commerce Cart Inspection ("show me my items in quick commerce", "view my cart", "what is in my cart"):
     ALWAYS map viewing or checking quick commerce items to:
     { "capabilityURN": "commerce.quick.view_cart", "providerId": "zepto_commerce", "parameters": { "platform": "zepto" }, "requiresConfirmation": false }

     CRITICAL PROVIDER & ACTION CONSTRAINTS:
     - ONLY use registered providers: open_meteo, openstreetmap_travel, flight_tracker, hotel_finder, shopping_agent, uber_mobility, ola_mobility, rapido_mobility, zomato_eats, zepto_commerce, swiggy_suite, aven_browser_agent, google_calendar, gmail, google_tasks, google_drive, google_contacts, google_fit, spotify, github, notion, obsidian_vault, filesystem_desktop, brave_search.
     - NEVER invent arbitrary non-existent provider IDs!
     - ANY request to open Amazon, Flipkart, or search for retail products online ("can you go to amazon.com and add a purse", "open browser and find black pants on amazon") MUST map to "shopping.browser.search_and_cart" or "shopping.products.search" with "shopping_agent" or "aven_browser_agent". NEVER map shopping or e-commerce intents to "context.system.open_url" or "filesystem_desktop"!
     - NEVER emit unsupported "shopping.products.purchase"! For purchasing items, route through "shopping.browser.search_and_cart" or "shopping.cart.add".

13. HUMAN-IN-THE-LOOP (HITL) POLICY:
   - READ and DRAFT operations (checking files, reading drive, inbox, contacts, calendar events, tasks, fit telemetry, pull requests, github repositories, notes, saving email drafts) DO NOT require confirmation: set "requiresConfirmation": false.
   - Irreversible WRITE operations (writing/creating local/external storage files, sending emails [send_message], scheduling calendar events, creating github issues, logging workouts, creating tasks, deleting items) MUST require confirmation: set "requiresConfirmation": true, "confirmationMode": "EXPLICIT_CONFIRMATION".

OUTPUT SCHEMA (Return ONLY valid JSON with minimal tokens):
{
  "primaryClassification": "ACTION_REQUEST" | "INFORMATION_QUERY" | "STATE_OBSERVATION" | "CASUAL_DIALOGUE" | "CLARIFICATION_RESPONSE" | "CONFIRMATION" | "CANCEL_OR_DISMISS",
  "ambiguityStatus": "UNAMBIGUOUS" | "OPERATION_AMBIGUOUS" | "ENTITY_AMBIGUOUS" | "TEMPORAL_AMBIGUOUS" | "CONFLICTING_INTENTS",
  "conversationalSummary": "Brief gist of what the user communicated",
  "operations": [
    {
      "operationId": "op_01",
      "actionType": "external_capability_action",
      "requiresConfirmation": true,
      "confirmationMode": "EXPLICIT_CONFIRMATION",
      "payload": {
        "capabilityURN": "wellness.media.playback_control",
        "providerId": "spotify",
        "parameters": { "command": "play", "query": "...", "targetType": "..." }
      }
    }
  ]
}`;

// Ensure environment variables from apps/web/.env are loaded if not already in environment
if (!process.env.GROQ_API_KEY) {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.resolve(process.cwd(), "apps/web/.env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch (_) {}
}

const PROMPT_HASH = crypto.createHash("sha256").update(SYSTEM_PROMPT_V2).digest("hex");

function repairTruncatedJSON(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch (_) {}

  // If truncated inside operations array, salvage completed operation objects
  const opIdx = jsonString.indexOf('"operations"');
  if (opIdx !== -1) {
    const arrStart = jsonString.indexOf("[", opIdx);
    if (arrStart !== -1) {
      let depth = 0;
      let inString = false;
      let escape = false;
      let lastCompletedObjEnd = -1;

      for (let i = arrStart + 1; i < jsonString.length; i++) {
        const char = jsonString[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === "\\") {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") {
            depth++;
          } else if (char === "}") {
            depth--;
            if (depth === 0) {
              lastCompletedObjEnd = i;
            }
          }
        }
      }

      if (lastCompletedObjEnd !== -1) {
        const repaired = jsonString.substring(0, lastCompletedObjEnd + 1) + "\n]}";
        try {
          return JSON.parse(repaired);
        } catch (_) {}
      }
    }
  }

  return null;
}

export class SemanticIntentInterpreter {
  private static instance: SemanticIntentInterpreter;

  static getInstance(): SemanticIntentInterpreter {
    if (!SemanticIntentInterpreter.instance) {
      SemanticIntentInterpreter.instance = new SemanticIntentInterpreter();
    }
    return SemanticIntentInterpreter.instance;
  }

  async interpret(rawInput: string, ctx: SemanticInterpreterContext): Promise<SemanticTurn> {
    const startTime = Date.now();
    const turnId = generateId("turn");
    const timezone = ctx.timezone || "UTC";
    const refTime = ctx.referenceTimeMs || Date.now();
    const trimmedInput = (rawInput || "").trim();

    let parsedTurn: any = null;

    // Call LLM for authoritative semantic interpretation
    if (
      !parsedTurn &&
      ((process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "mock_key_for_dev") ||
       (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "mock_key_for_dev"))
    ) {
      try {
        const contextSummary = [
          `Current Active Time: ${new Date(refTime).toISOString()} (Timezone: ${timezone})`,
          ctx.activeMode ? `Active Context Mode: ${ctx.activeMode}` : null,
          ctx.activeFocus ? `Active Focus Entity: [${ctx.activeFocus.entityType}] "${ctx.activeFocus.displayName}" (id: ${ctx.activeFocus.entityId})` : null,
          ctx.pendingOperation && (ctx.pendingOperation as any).state === "AWAITING_CLARIFICATION"
            ? `PENDING CLARIFICATION OPERATION: Currently awaiting user clarification for action "${ctx.pendingOperation.actionType}". Question asked was: "${ctx.pendingOperation.clarificationQuestion}". Missing requirement: ${JSON.stringify((ctx.pendingOperation as any).missingRequirement)}`
            : null,
          ctx.recentEntities?.length
            ? `Recent Entities: ${JSON.stringify(ctx.recentEntities.map((e) => ({ type: e.entityType, name: e.displayName, id: e.entityId })))}`
            : null,
          ctx.knownTasks?.length ? `Known Active Tasks: ${JSON.stringify(ctx.knownTasks)}` : null,
          ctx.activeIncidents?.length ? `Active Incidents: ${JSON.stringify(ctx.activeIncidents)}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        const messages: any[] = [
          { role: "system", content: `${SYSTEM_PROMPT_V2}\n\nACTIVE CONTEXT:\n${contextSummary}` },
        ];

        if (ctx.recentHistory && ctx.recentHistory.length > 0) {
          for (const hist of ctx.recentHistory.slice(-6)) {
            messages.push({ role: hist.role, content: hist.content });
          }
        }

        messages.push({ role: "user", content: trimmedInput });

        const rawResponse = await groqChat({
          messages,
          model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
          temperature: 0.1,
          max_tokens: 900,
        });

        const cleaned = cleanLLMResponse(rawResponse);
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart !== -1) {
          const sliceCandidate = jsonEnd > jsonStart ? cleaned.substring(jsonStart, jsonEnd + 1) : cleaned.substring(jsonStart);
          const sanitized = sliceCandidate
            .replace(/^\s*\/\/.*$/gm, "")
            .replace(/,\s*([}\]])/g, "$1");
          try {
            parsedTurn = JSON.parse(sanitized);
          } catch (parseErr) {
            parsedTurn = repairTruncatedJSON(sanitized);
            if (!parsedTurn) throw parseErr;
          }
        }
      } catch (llmErr) {
        console.warn("[SEMANTIC_INTERPRETER] LLM call failed, falling back to heuristic parsing:", llmErr);
      }
    }

    // Heuristic Fallback if LLM unavailable or failed to produce JSON
    if (!parsedTurn) {
      parsedTurn = this.heuristicInterpretation(trimmedInput, ctx);
    }

    // Check if there is an active PendingOperationContext that should be continued
    const hasActivePending = Boolean(
      ctx.pendingOperation &&
      ((ctx.pendingOperation as any).state === "AWAITING_CLARIFICATION" ||
       (ctx.pendingOperation as any).state === "AWAITING_CONFIRMATION")
    );

    if (hasActivePending) {
      const isAffirmative =
        parsedTurn?.primaryClassification === "CONFIRMATION" ||
        /^(?:yes|yep|yeah|sure|confirm|proceed|ok|okay|allow|do it|send it|go ahead)[\s.!]*$/i.test(trimmedInput) ||
        trimmedInput.toLowerCase().startsWith("yes,") ||
        trimmedInput.toLowerCase().startsWith("yes ");
      const isClarificationClassification =
        isAffirmative || parsedTurn?.primaryClassification === "CLARIFICATION_RESPONSE";

      if (isClarificationClassification) {
        const pending: any = ctx.pendingOperation;
        let continuedActionType: DomainActionType = pending.actionType;
        const continuedDomain = pending.domain || "productivity";
        const continuedPayload = { ...(pending.partialPayload || {}) };
        let targetRef: any = undefined;

        const missingKind = typeof pending.missingRequirement === "object" ? pending.missingRequirement.kind : pending.missingRequirement;

        // Case 1: Pending Confirmation (e.g. proposed goal confirmation, slot blocking, duplicate confirmation, or sensitive external action confirmation)
        if (
          isAffirmative &&
          (pending.state === "AWAITING_CONFIRMATION" ||
            missingKind === "CONFIRMATION" ||
            missingKind === "DUPLICATE_CONFIRMATION" ||
            continuedActionType === "confirm_goal" ||
            continuedActionType === "propose_goal" ||
            continuedActionType === "create_temporal_series" ||
            continuedActionType === "schedule_occurrence" ||
            continuedActionType === "external_capability_action" ||
            String(pending.clarificationQuestion || "").toLowerCase().includes("block") ||
            String(pending.clarificationQuestion || "").toLowerCase().includes("calendar") ||
            String(pending.clarificationQuestion || "").toLowerCase().includes("schedule") ||
            String(pending.clarificationQuestion || "").toLowerCase().includes("permission") ||
            String(pending.clarificationQuestion || "").toLowerCase().includes("proceed"))
        ) {
          if (continuedActionType === "propose_goal") {
            continuedActionType = "confirm_goal";
          }
          const confirmedEntityId = continuedPayload.goalId || pending.candidateEntities?.[0]?.entityId || ctx.activeFocus?.entityId;
          const confirmedTitle = continuedPayload.title || pending.candidateEntities?.[0]?.displayName || ctx.activeFocus?.displayName;
          if (confirmedEntityId) {
            continuedPayload.goalId = confirmedEntityId;
          }
          if (confirmedTitle) {
            continuedPayload.title = confirmedTitle;
          }
          targetRef = {
            referenceId: generateId("ref"),
            rawExpression: trimmedInput,
            entityType: (pending.missingRequirement?.targetEntityType as any) || "storage",
            kind: "CONTEXTUAL_ANAPHORIC",
            contextualRelation: "PENDING_OPERATION",
            resolutionStrategy: "CONTEXTUAL_RECENT",
            resolvedEntityId: confirmedEntityId,
          };
          parsedTurn.clarification = undefined;
          parsedTurn.ambiguityStatus = "UNAMBIGUOUS";
          const capURN = continuedPayload.capabilityURN || (continuedPayload as any)?.parameters?.capabilityURN || (pending as any).capabilityURN;
          const providerId = continuedPayload.providerId || (continuedPayload as any)?.parameters?.providerId || (pending as any).providerHint;
          parsedTurn.clarification = undefined;
          parsedTurn.ambiguityStatus = "UNAMBIGUOUS";
          parsedTurn.primaryClassification = "CONFIRMATION";
          parsedTurn.conversationalSummary = "Confirmed.";
          parsedTurn.operations = [
            {
              operationId: pending.operationId || generateId("op"),
              domain: continuedDomain,
              actionType: continuedActionType,
              riskClass: "LOW_REVERSIBLE",
              payload: continuedPayload,
              requiresConfirmation: false,
              confirmationGranted: true,
              targetReference: targetRef,
              executionEligibility: "READY",
              dependencies: [],
              capabilityURN: capURN,
              providerHint: providerId,
            },
          ];
        } else if (missingKind === "TARGET_ENTITY_RESOLUTION" || missingKind === "UNKNOWN") {
          // Case 2: Target Entity Resolution
          const rawTargetExpr = trimmedInput
            .replace(/^(?:the\s+task\s+(?:to\s+)?|the\s+one\s+(?:to\s+)?|the\s+task\s+|task\s+(?:to\s+)?)/i, "")
            .trim();
          const { AuthoritativeEntityResolver } = await import("../context/AuthoritativeEntityResolver");
          const resolver = AuthoritativeEntityResolver.getInstance();
          const resolution = await resolver.resolveEntity({
            userId: ctx.userId,
            rawExpression: rawTargetExpr || trimmedInput,
            semanticDescriptor: parsedTurn?.operations?.[0]?.targetReference?.semanticDescriptor,
            kind: parsedTurn?.operations?.[0]?.targetReference?.kind,
            entityType: (pending.missingRequirement?.targetEntityType as any) || "task",
            statusFilter: "pending",
            activeFocus: ctx.activeFocus,
            recentEntities: ctx.recentEntities,
            pendingCandidates: pending.candidateEntities,
            knownTasks: ctx.knownTasks,
          });

          if (resolution.status === "RESOLVED") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: trimmedInput,
              entityType: (pending.missingRequirement?.targetEntityType as any) || "task",
              resolutionStrategy: "EXACT_TITLE",
              resolvedEntityId: resolution.entityId,
              evidence: resolution.evidence,
            };
            if (continuedActionType.includes("task")) {
              continuedPayload.taskId = resolution.entityId;
              continuedPayload.title = resolution.title;
            } else if (continuedActionType.includes("goal")) {
              continuedPayload.goalId = resolution.entityId;
              continuedPayload.title = resolution.title;
            } else if (continuedActionType.includes("workout")) {
              continuedPayload.sessionId = resolution.entityId;
            }
            parsedTurn.clarification = undefined;
            parsedTurn.ambiguityStatus = "UNAMBIGUOUS";
          } else {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: trimmedInput,
              entityType: (pending.missingRequirement?.targetEntityType as any) || "task",
              resolutionStrategy: resolution.status === "AMBIGUOUS" ? "AMBIGUOUS_CANDIDATES" : "UNRESOLVED",
              candidateIds: resolution.candidateIds,
              evidence: resolution.evidence,
            };
            parsedTurn.clarification = {
              required: true,
              questionToUser: resolution.clarificationQuestion,
            };
            parsedTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
          }
        } else if (missingKind === "PARAMETER_VALUE") {
          const paramName = pending.missingRequirement?.parameterName || "value";
          continuedPayload[paramName] = trimmedInput;

          if (
            continuedActionType === "create_temporal_series" ||
            continuedActionType === "schedule_occurrence" ||
            String(pending.clarificationQuestion || "").toLowerCase().includes("class") ||
            String(pending.clarificationQuestion || "").toLowerCase().includes("routine") ||
            String(pending.clarificationQuestion || "").toLowerCase().includes("schedule")
          ) {
            continuedActionType = "create_temporal_series";
            if (!continuedPayload.title) {
              continuedPayload.title = "University classes";
            }
          }

          parsedTurn.clarification = undefined;
          parsedTurn.ambiguityStatus = "UNAMBIGUOUS";
        }

        if (!isAffirmative) {
          parsedTurn.primaryClassification = "CLARIFICATION_RESPONSE";
          parsedTurn.conversationalSummary = "Proceeding with your request.";
          parsedTurn.operations = [
            {
              operationId: `op_cont_${Date.now()}`,
              domain: continuedDomain,
              actionType: continuedActionType,
              riskClass: "MEDIUM_COMPENSABLE",
              targetReference: targetRef,
              payload: continuedPayload,
              dependencies: [],
              executionEligibility: targetRef?.resolvedEntityId || missingKind === "PARAMETER_VALUE" ? "READY" : "REQUIRES_CLARIFICATION",
            },
          ];
        }
      }
    }

    // Normalize affective evidence
    let affectiveEvidence = parsedTurn.affectiveEvidence;
    if (affectiveEvidence && !affectiveEvidence.rawVerbatim) {
      affectiveEvidence.rawVerbatim = trimmedInput;
    }

    // Post-processing & Enrichment
    const operations: SemanticOperation[] = [];
    const rawOps: any[] = Array.isArray(parsedTurn.operations) ? parsedTurn.operations : [];

    for (let i = 0; i < rawOps.length; i++) {
      const rawOp = rawOps[i];
      const opId = rawOp.operationId || `op_0${i + 1}`;
      let actionType: DomainActionType = rawOp.actionType || "create_task";
      let payload = rawOp.payload || {};

      if (rawOp.capabilityURN) {
        actionType = "external_capability_action";
        if (!payload.capabilityURN) payload.capabilityURN = rawOp.capabilityURN;
        if (!payload.providerId) payload.providerId = rawOp.providerId || rawOp.providerHint;
        if (!payload.parameters && rawOp.parameters) payload.parameters = rawOp.parameters;
      }

      // Ensure propose_goal / create_goal has valid title and cadence
      if (actionType === "propose_goal" || actionType === "create_goal") {
        if (!payload.title) {
          payload.title = payload.name || payload.habit || payload.goalTitle || payload.goal || payload.description || rawOp.targetReference?.semanticDescriptor || rawOp.targetReference?.rawExpression || "Goal";
        }
        if (!payload.cadence) {
          payload.cadence = "daily";
        }
      }

      if (payload.newPriority && !payload.priority) {
        payload.priority = String(payload.newPriority).toLowerCase();
      }
      if (payload.updates?.priority && !payload.priority) {
        payload.priority = String(payload.updates.priority).toLowerCase();
      }
      if (payload.priority) {
        payload.priority = String(payload.priority).toLowerCase();
      }

      // 1. Enrich meals with nutrition estimator
      if (actionType === "log_meal") {
        const mealDesc = payload.description || payload.mealName || trimmedInput;
        const needsEstimation =
          !payload.items ||
          !Array.isArray(payload.items) ||
          payload.items.length === 0 ||
          !payload.totalCalories ||
          payload.items.some((it: any) => typeof it.calories !== "number" || typeof it !== "object");

        if (needsEstimation) {
          const estimated = await NutritionEstimator.getInstance().estimateMeal(mealDesc);
          payload.description = mealDesc;
          payload.items = estimated.items;
          payload.totalCalories = estimated.totalCalories;
          payload.enrichmentSource = estimated.source;
        }
      }

      // 2. Enrich mental state from affective evidence if values are missing
      if (actionType === "record_mental_estimate") {
        if (payload.energy === undefined && affectiveEvidence?.energy?.value !== undefined) {
          payload.energy = affectiveEvidence.energy.value;
        }
        if (payload.stress === undefined && affectiveEvidence?.stress?.value !== undefined) {
          payload.stress = affectiveEvidence.stress.value;
        }
        if (payload.mood === undefined && affectiveEvidence?.mood?.value !== undefined) {
          payload.mood = affectiveEvidence.mood.value;
        }
        if (payload.focus === undefined && affectiveEvidence?.focus?.value !== undefined) {
          payload.focus = affectiveEvidence.focus.value;
        }
        if (!payload.notes && affectiveEvidence?.rawVerbatim) {
          payload.notes = affectiveEvidence.rawVerbatim;
        }
      }

      // 3. Resolve temporal references
      let resolvedTemporal: any = undefined;
      const rawTimeExpr = rawOp.temporal?.rawExpression || payload.dueDate || payload.date || payload.dateOnly;
      if (rawOp.temporal?.structuredMeaning) {
        const { resolveStructuredTemporal } = await import("./temporalResolver");
        const temp = resolveStructuredTemporal(rawOp.temporal.structuredMeaning, timezone, refTime);
        resolvedTemporal = {
          rawExpression: rawOp.temporal.rawExpression || `${temp.dateOnly} ${temp.timeOnly || ""}`,
          type: rawOp.temporal.type || "POINT_IN_TIME",
          parsedAnchor: temp.dateOnly,
          resolvedDate: temp.dateOnly,
          resolvedTime: temp.timeOnly,
          timezone,
          isAmbiguous: false,
          structuredMeaning: rawOp.temporal.structuredMeaning,
        };
      } else if (rawTimeExpr) {
        const temp = resolveTemporalExpression(rawTimeExpr, timezone, refTime);
        resolvedTemporal = {
          rawExpression: rawTimeExpr,
          type: "POINT_IN_TIME",
          parsedAnchor: temp.dateOnly,
          resolvedDate: temp.dateOnly,
          resolvedTime: temp.timeOnly,
          timezone,
          isAmbiguous: false,
        };
        if (actionType === "create_task" || actionType === "reschedule_task") {
          payload.dueDate = temp.dateOnly;
          if (temp.timeOnly) payload.dueTime = temp.timeOnly;
        } else if (actionType === "record_mental_estimate") {
          payload.date = temp.dateOnly;
        } else if (actionType === "schedule_occurrence") {
          if (!payload.dateOnly || payload.dateOnly === "today" || payload.dateOnly === "tomorrow") {
            payload.dateOnly = temp.dateOnly;
          }
          if (!payload.startTime && temp.timeOnly) {
            payload.startTime = temp.timeOnly;
          }
        }
      }

      // 3b. Deterministic Normalization for RoutineAI schedule_occurrence
      if (actionType === "schedule_occurrence") {
        if (!payload.dateOnly || payload.dateOnly === "today") {
          payload.dateOnly = resolvedTemporal?.resolvedDate || getActiveDate(timezone, 4, new Date(refTime));
        } else if (payload.dateOnly === "tomorrow") {
          const d = new Date(refTime);
          d.setUTCDate(d.getUTCDate() + 1);
          payload.dateOnly = d.toISOString().split("T")[0];
        }
        if (!payload.kind) {
          payload.kind = "WORK_SESSION";
        }
        if (!payload.rigidity) {
          payload.rigidity = "ELASTIC";
        }
        if (!payload.timezone) {
          payload.timezone = timezone;
        }
        // Normalize interval if startTime is present
        if (payload.startTime) {
          const { normalizeTemporalInterval } = await import("../../temporal/normalization/temporalNormalizer");
          const norm = normalizeTemporalInterval({
            dateOnly: payload.dateOnly,
            startTime: payload.startTime,
            endTime: payload.endTime,
            durationMinutes: payload.durationMinutes,
            timezone,
          });
          if (norm.valid && norm.interval) {
            payload.durationMinutes = norm.interval.durationMinutes;
            payload.endTime = minutesToTimeString(norm.interval.endMinute % 1440);
          }
        }
      }

      // 3c. Deterministic Normalization for log_execution_interval
      if (actionType === "log_execution_interval") {
        if (!payload.dateOnly || payload.dateOnly === "today") {
          payload.dateOnly = resolvedTemporal?.resolvedDate || getActiveDate(timezone, 4, new Date(refTime));
        } else if (payload.dateOnly === "yesterday") {
          const d = new Date(refTime);
          d.setUTCDate(d.getUTCDate() - 1);
          payload.dateOnly = d.toISOString().split("T")[0];
        }

        const dateStr = payload.dateOnly;
        let startMs = payload.startedAtMs;
        let endMs = payload.endedAtMs;

        if (typeof startMs !== "number" || typeof endMs !== "number") {
          const stStr = payload.startTime || payload.time || "09:00";
          const [sh, sm] = stStr.split(":").map(Number);
          const startMin = (sh || 0) * 60 + (sm || 0);

          let durMin = payload.durationMinutes;
          if (!durMin && payload.endTime) {
            const [eh, em] = payload.endTime.split(":").map(Number);
            const endMinute = (eh || 0) * 60 + (em || 0);
            durMin = Math.max(1, endMinute - startMin);
          }
          if (!durMin) durMin = 60;

          const startIso = `${dateStr}T${String(sh || 0).padStart(2, "0")}:${String(sm || 0).padStart(2, "0")}:00Z`;
          startMs = new Date(startIso).getTime();
          endMs = startMs + durMin * 60 * 1000;

          payload.startedAtMs = startMs;
          payload.endedAtMs = endMs;
          payload.durationMinutes = durMin;
        }
      }

      // 3d. Deterministic Normalization for cancel_occurrence
      if (actionType === "cancel_occurrence") {
        if (!payload.dateOnly || payload.dateOnly === "today") {
          payload.dateOnly = resolvedTemporal?.resolvedDate || getActiveDate(timezone, 4, new Date(refTime));
        }
        if (!payload.status) {
          const msgLower = (trimmedInput || "").toLowerCase();
          payload.status = msgLower.includes("skip") ? "SKIPPED" : "CANCELLED";
        }
      }

      // 4. Resolve entity references for actions requiring target entities
      let targetRef = rawOp.targetReference;
      const cap = DOMAIN_CAPABILITIES[actionType];
      if (cap?.requiresTargetEntity) {
        const rawTargetExpr = targetRef?.rawExpression || payload.title || payload.taskId || payload.goalId || "";
        if (rawTargetExpr) {
          const { AuthoritativeEntityResolver } = await import("../context/AuthoritativeEntityResolver");
          const resolver = AuthoritativeEntityResolver.getInstance();
          const resolution = await resolver.resolveEntity({
            userId: ctx.userId,
            rawExpression: rawTargetExpr,
            semanticDescriptor: targetRef?.semanticDescriptor,
            kind: targetRef?.kind,
            contextualRelation: targetRef?.contextualRelation,
            entityType: cap.targetEntityType || "task",
            statusFilter: "pending",
            activeFocus: ctx.activeFocus,
            recentEntities: ctx.recentEntities,
            pendingCandidates: (ctx.pendingOperation as any)?.candidateEntities,
            knownTasks: ctx.knownTasks,
          });

          if (resolution.status === "RESOLVED") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: rawTargetExpr,
              semanticDescriptor: targetRef?.semanticDescriptor,
              kind: targetRef?.kind,
              entityType: cap.targetEntityType || "task",
              resolutionStrategy: targetRef?.kind === "CONTEXTUAL_ANAPHORIC" ? "CONTEXTUAL_RECENT" : "EXACT_TITLE",
              resolvedEntityId: resolution.entityId,
              evidence: resolution.evidence,
            };
            if (cap.targetEntityType === "task") {
              payload.taskId = resolution.entityId;
              payload.title = resolution.title;
            } else if (cap.targetEntityType === "goal") {
              payload.goalId = resolution.entityId;
              payload.title = resolution.title;
            } else if (cap.targetEntityType === "workout") {
              payload.sessionId = resolution.entityId;
            }
          } else if (resolution.status === "AMBIGUOUS") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: rawTargetExpr,
              entityType: cap.targetEntityType || "task",
              resolutionStrategy: "AMBIGUOUS_CANDIDATES",
              candidateIds: resolution.candidateIds,
              evidence: resolution.evidence,
            };
            parsedTurn.clarification = {
              required: true,
              questionToUser: resolution.clarificationQuestion,
            };
            parsedTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
          } else if (resolution.status === "NOT_FOUND") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: rawTargetExpr,
              entityType: cap.targetEntityType || "task",
              resolutionStrategy: "UNRESOLVED",
              evidence: resolution.evidence,
            };
            parsedTurn.clarification = {
              required: true,
              questionToUser: resolution.clarificationQuestion,
            };
            parsedTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
          }
        } else if (!targetRef?.resolvedEntityId) {
          const noun = cap.verbalization?.entityNoun || "item";
          parsedTurn.clarification = {
            required: true,
            questionToUser: `Which ${noun} are you referring to?`,
          };
          parsedTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
        }
      }

      let opDomain = rawOp.domain;
      if (!opDomain) {
        const cap = rawOp.capabilityURN || payload.capabilityURN;
        if (cap && typeof cap === "string") {
          if (cap.startsWith("health.")) {
            opDomain = "health";
          } else if (cap.startsWith("wellness.")) {
            opDomain = "wellness";
          } else {
            opDomain = "productivity";
          }
        } else {
          opDomain = "productivity";
        }
      }

      const op: SemanticOperation = {
        operationId: opId,
        domain: opDomain,
        actionType,
        riskClass: (rawOp.riskClass as OperationRiskClass) || (rawOp.requiresConfirmation ? "HIGH_IRREVERSIBLE" : "LOW_REVERSIBLE"),
        targetReference: targetRef,
        temporal: resolvedTemporal,
        payload,
        dependencies: Array.isArray(rawOp.dependencies) ? rawOp.dependencies : [],
        executionEligibility: "READY",
        capabilityURN: rawOp.capabilityURN || payload.capabilityURN,
        providerHint: rawOp.providerId || rawOp.providerHint || payload.providerId,
      };

      const eligibility = isOperationExecutable(op);
      if (!eligibility.executable) {
        op.executionEligibility = "REQUIRES_CLARIFICATION";
      }

      operations.push(op);
    }

    const durationMs = Date.now() - startTime;
    const finalTurn: SemanticTurn = {
      turnId,
      schemaVersion: 2,
      userId: ctx.userId,
      conversationId: ctx.conversationId || generateId("conv"),
      timestamp: refTime,
      rawInput: trimmedInput,
      normalizedTimezone: timezone,
      provenance: {
        interpreterProvider: "groq",
        modelIdentifier: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        promptVersionHash: PROMPT_HASH,
        contextSnapshotId: "ctx_live",
        contextSnapshotHash: crypto.createHash("sha256").update(JSON.stringify(ctx)).digest("hex"),
        inferenceDurationMs: durationMs,
      },
      primaryClassification: (parsedTurn.primaryClassification as TurnPrimaryClassification) || (operations.length > 0 ? "ACTION_REQUEST" : "CASUAL_DIALOGUE"),
      ambiguityStatus: (parsedTurn.ambiguityStatus as AmbiguityStatus) || "UNAMBIGUOUS",
      operations,
      affectiveEvidence,
      conversationalSummary: parsedTurn.conversationalSummary || trimmedInput,
      clarification: parsedTurn.clarification,
    };

    return finalTurn;
  }
  /**
   * Fail-Safe Fallback when LLM is unreachable or encounters an outage
   * Pure model-driven architecture: NEVER guesses with regexes or brittle substring checks.
   */
  private heuristicInterpretation(input: string, ctx: SemanticInterpreterContext): any {
    return {
      primaryClassification: "CASUAL_DIALOGUE",
      ambiguityStatus: "UNAMBIGUOUS",
      conversationalSummary: input,
      operations: [],
    };
  }
}
