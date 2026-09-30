/**
 * ProviderRegistry.ts
 *
 * Deterministic metadata catalog for capability providers.
 * Pure metadata: NO execution logic, NO fuzzy matching, NO natural language processing.
 */

import { CapabilityURN, ProviderId } from "../../contracts/ExternalCapabilityContracts";

export interface ProviderDefinition {
  providerId: ProviderId;
  displayName: string;
  category: "productivity" | "communication" | "health" | "wellness" | "system";
  description: string;
  advertisedCapabilities: CapabilityURN[];
  transportType: "LOCAL_STDIO" | "STREAMABLE_HTTP" | "SSE" | "NATIVE_BRIDGE";
  authType: "OAUTH2" | "API_KEY" | "PAT" | "NONE";
  requiredScopes: string[];
  defaultTimeoutMs: number;
  circuitBreakerThreshold: number;
  lifecycleState: "ACTIVE" | "DEPRECATED" | "EXPERIMENTAL";
}

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private providers: Map<ProviderId, ProviderDefinition> = new Map();

  constructor() {
    this.registerCoreProviders();
  }

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  register(definition: ProviderDefinition): void {
    this.providers.set(definition.providerId, definition);
  }

  get(providerId: string): ProviderDefinition | undefined {
    const aliasMap: Record<string, ProviderId> = {
      local_os: "filesystem_desktop",
      local_filesystem: "filesystem_desktop",
      filesystem: "filesystem_desktop",
      system: "filesystem_desktop",
      desktop: "filesystem_desktop",
      websearch: "brave_search",
      google: "google_calendar",
      contacts: "google_contacts",
      drive: "google_drive",
      fit: "google_fit",
      tasks: "google_tasks",
      calendar: "google_calendar",
      mail: "gmail",
      obsidian: "obsidian_vault",
      google_notes: "google_drive",
      google_keep: "google_drive",
      keep: "google_drive",
    };
    const resolved = (aliasMap[providerId] || providerId) as ProviderId;
    return this.providers.get(resolved);
  }

  getAll(): ProviderDefinition[] {
    return Array.from(this.providers.values());
  }

  findProvidersForCapability(capabilityURN: CapabilityURN): ProviderId[] {
    const matches: ProviderId[] = [];
    for (const [id, def] of this.providers.entries()) {
      if (def.advertisedCapabilities.includes(capabilityURN)) {
        matches.push(id);
      }
    }
    return matches;
  }

  private registerCoreProviders(): void {
    // 1. Google Calendar
    this.register({
      providerId: "google_calendar",
      displayName: "Google Calendar",
      category: "productivity",
      description: "Read, schedule, and organize calendar events and meetings.",
      advertisedCapabilities: [
        "productivity.calendar.read_events",
        "productivity.calendar.create_event",
        "productivity.calendar.update_event",
        "productivity.calendar.delete_event",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "OAUTH2",
      requiredScopes: ["https://www.googleapis.com/auth/calendar.events"],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 2. Google Tasks
    this.register({
      providerId: "google_tasks",
      displayName: "Google Tasks",
      category: "productivity",
      description: "Sync personal to-dos and project task lists with Google.",
      advertisedCapabilities: [
        "productivity.task.create_external",
        "productivity.task.sync_tasks",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "OAUTH2",
      requiredScopes: ["https://www.googleapis.com/auth/tasks"],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 3. Gmail
    this.register({
      providerId: "gmail",
      displayName: "Gmail",
      category: "communication",
      description: "Search email, inspect conversation threads, and draft communications.",
      advertisedCapabilities: [
        "productivity.email.send_message",
        "productivity.email.create_draft",
        "productivity.email.search_messages",
        "productivity.email.read_thread",
        "productivity.email.read_message",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "OAUTH2",
      requiredScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      defaultTimeoutMs: 6000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 4. Google Drive
    this.register({
      providerId: "google_drive",
      displayName: "Google Drive",
      category: "productivity",
      description: "Search documents, read workspace files, and organize folders.",
      advertisedCapabilities: [
        "productivity.storage.read_file",
        "productivity.storage.list_files",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "OAUTH2",
      requiredScopes: ["https://www.googleapis.com/auth/drive.readonly"],
      defaultTimeoutMs: 6000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 5. Google Contacts
    this.register({
      providerId: "google_contacts",
      displayName: "Google Contacts",
      category: "productivity",
      description: "Resolve people, phone numbers, and communication channels.",
      advertisedCapabilities: [
        "productivity.contacts.search_contacts",
        "productivity.contacts.get_contact",
        "productivity.email.search_messages",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "OAUTH2",
      requiredScopes: ["https://www.googleapis.com/auth/contacts.readonly"],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 5b. Google Fit
    this.register({
      providerId: "google_fit",
      displayName: "Google Fit",
      category: "health",
      description: "Sync fitness telemetry, track workouts, active calories, and heart rate.",
      advertisedCapabilities: [
        "health.activity.record_workout",
        "health.activity.sync_telemetry",
        "health.biometrics.read_sleep",
        "health.biometrics.read_daily_summary",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "OAUTH2",
      requiredScopes: [
        "https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.activity.write",
        "https://www.googleapis.com/auth/fitness.body.read",
        "https://www.googleapis.com/auth/fitness.sleep.read",
      ],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 6. Spotify
    this.register({
      providerId: "spotify",
      displayName: "Spotify",
      category: "wellness",
      description: "Music playback control, focus playlists, and ambient soundscapes.",
      advertisedCapabilities: [
        "wellness.media.playback_control",
        "wellness.media.read_current_track",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "OAUTH2",
      requiredScopes: [
        "user-modify-playback-state",
        "user-read-playback-state",
        "user-read-currently-playing",
      ],
      defaultTimeoutMs: 4000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 7. GitHub
    this.register({
      providerId: "github",
      displayName: "GitHub",
      category: "productivity",
      description: "Work with repositories, open issues, and inspect pull requests.",
      advertisedCapabilities: [
        "productivity.git.create_issue",
        "productivity.git.list_prs",
        "productivity.git.list_repos",
        "productivity.git.search_code",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "PAT",
      requiredScopes: ["repo", "read:user"],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 8. Linear
    this.register({
      providerId: "linear",
      displayName: "Linear",
      category: "productivity",
      description: "Streamline engineering tickets, sprint issues, and project cycles.",
      advertisedCapabilities: [
        "productivity.task.create_external",
        "productivity.task.sync_tasks",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "API_KEY",
      requiredScopes: ["read", "write", "issues:create"],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 9. Slack
    this.register({
      providerId: "slack",
      displayName: "Slack",
      category: "communication",
      description: "Send workspace channel updates and direct messages to colleagues.",
      advertisedCapabilities: [
        "productivity.email.send_message",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "OAUTH2",
      requiredScopes: ["chat:write", "channels:read"],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 10. Notion
    this.register({
      providerId: "notion",
      displayName: "Notion",
      category: "productivity",
      description: "Sync workspace databases, task backlogs, and structured notes.",
      advertisedCapabilities: [
        "productivity.task.create_external",
        "productivity.storage.list_files",
        "productivity.storage.read_file",
        "productivity.storage.write_file",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "API_KEY",
      requiredScopes: [],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 11. Obsidian Vault
    this.register({
      providerId: "obsidian_vault",
      displayName: "Obsidian Vault",
      category: "productivity",
      description: "Read, write, and index local Markdown knowledge graphs.",
      advertisedCapabilities: [
        "productivity.storage.read_file",
        "productivity.storage.write_file",
        "productivity.storage.list_files",
      ],
      transportType: "LOCAL_STDIO",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 3000,
      circuitBreakerThreshold: 5,
      lifecycleState: "ACTIVE",
    });

    // 12. Home Assistant
    this.register({
      providerId: "home_assistant",
      displayName: "Home Assistant",
      category: "wellness",
      description: "Smart home environment control, temperature, and focus scenes.",
      advertisedCapabilities: [
        "wellness.smarthome.set_light_state",
        "wellness.smarthome.set_thermostat",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "API_KEY",
      requiredScopes: [],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 13. Philips Hue
    this.register({
      providerId: "philips_hue",
      displayName: "Philips Hue",
      category: "wellness",
      description: "Circadian lighting, focus desk lamps, and ambient room shades.",
      advertisedCapabilities: [
        "wellness.smarthome.set_light_state",
      ],
      transportType: "LOCAL_STDIO",
      authType: "API_KEY",
      requiredScopes: [],
      defaultTimeoutMs: 3000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 14. Apple Health Bridge
    this.register({
      providerId: "apple_health_bridge",
      displayName: "Apple Health",
      category: "health",
      description: "Sync sleep metrics, active calories, and workout telemetry.",
      advertisedCapabilities: [
        "health.activity.record_workout",
        "health.activity.sync_telemetry",
        "health.biometrics.read_sleep",
        "health.biometrics.read_daily_summary",
      ],
      transportType: "NATIVE_BRIDGE",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 15. Health Connect Bridge
    this.register({
      providerId: "health_connect_bridge",
      displayName: "Health Connect",
      category: "health",
      description: "Android health metrics, step telemetry, and nutrition tracking.",
      advertisedCapabilities: [
        "health.activity.record_workout",
        "health.activity.sync_telemetry",
        "health.biometrics.read_sleep",
        "health.biometrics.read_daily_summary",
      ],
      transportType: "NATIVE_BRIDGE",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 16. Filesystem Desktop (Local OS)
    this.register({
      providerId: "filesystem_desktop",
      displayName: "Local Filesystem",
      category: "system",
      description: "Access local desktop files, execute approved OS commands, and launch apps.",
      advertisedCapabilities: [
        "productivity.storage.read_file",
        "productivity.storage.write_file",
        "productivity.storage.list_files",
        "context.system.open_url",
        "context.system.read_clipboard",
      ],
      transportType: "LOCAL_STDIO",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 3000,
      circuitBreakerThreshold: 5,
      lifecycleState: "ACTIVE",
    });

    // 17. Brave Search / Web Search
    this.register({
      providerId: "brave_search",
      displayName: "Web Search",
      category: "system",
      description: "Retrieve real-time web information and public research summaries.",
      advertisedCapabilities: ["context.system.search_web"],
      transportType: "STREAMABLE_HTTP",
      authType: "API_KEY",
      requiredScopes: [],
      defaultTimeoutMs: 4000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 18. Open-Meteo Weather (100% Free, Zero-Config)
    this.register({
      providerId: "open_meteo",
      displayName: "Open-Meteo Weather",
      category: "wellness",
      description: "Global open weather forecasts, temperature, precipitation, and air quality telemetry.",
      advertisedCapabilities: [
        "context.environment.read_weather",
        "context.environment.get_forecast",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 4000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 19. OpenStreetMap & Wikivoyage Travel Planning (100% Free, Zero-Config)
    this.register({
      providerId: "openstreetmap_travel",
      displayName: "OpenStreetMap & Wikivoyage Travel",
      category: "productivity",
      description: "Open tourist attractions, destination guides, and automated day-by-day travel itineraries.",
      advertisedCapabilities: [
        "travel.itinerary.generate",
        "travel.places.search",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 6000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 20. Flight Mobility Engine (100% Free, Zero-Config)
    this.register({
      providerId: "flight_tracker",
      displayName: "Flight Engine",
      category: "productivity",
      description: "Real-time flight search, schedules, airline pricing comparisons, and direct booking deep links.",
      advertisedCapabilities: [
        "travel.flights.search",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 21. Hotel & Stays Engine (100% Free, Zero-Config)
    this.register({
      providerId: "hotel_finder",
      displayName: "Hotel & Stays Engine",
      category: "productivity",
      description: "Verified hotel accommodations, guest houses, pricing estimates, and direct booking cards.",
      advertisedCapabilities: [
        "travel.hotels.search",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 5000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 22. Online Shopping & Cart Assistant (Amazon, Flipkart, Retail)
    this.register({
      providerId: "shopping_agent",
      displayName: "Online Shopping & Cart Assistant",
      category: "productivity",
      description: "Automated product search, real-time price comparison, and safe browser cart checkout gate across Amazon & Flipkart.",
      advertisedCapabilities: [
        "shopping.products.search",
        "shopping.cart.add",
        "shopping.browser.search_and_cart",
        "shopping.browser.checkout_gate",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 12000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 23. Uber Mobility (MCP & Deep Link Dispatch)
    this.register({
      providerId: "uber_mobility",
      displayName: "Uber",
      category: "productivity",
      description: "Live ride pricing, UberGo, Premier, UberAuto fare estimates, and 1-tap dispatch.",
      advertisedCapabilities: [
        "mobility.rides.estimate",
        "mobility.rides.request",
        "mobility.rides.status",
        "mobility.rides.cancel",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 6000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 24. Ola Mobility (Universal Deep Link & Transit Dispatch)
    this.register({
      providerId: "ola_mobility",
      displayName: "Ola Cabs",
      category: "productivity",
      description: "Ola Mini, Prime Sedan, and Auto fare estimates with instant native app dispatch.",
      advertisedCapabilities: [
        "mobility.rides.estimate",
        "mobility.rides.request",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 4000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 25. Rapido Mobility (Bike & Auto Express)
    this.register({
      providerId: "rapido_mobility",
      displayName: "Rapido",
      category: "productivity",
      description: "Rapido Bike Taxi & Auto fare comparison with instant booking deep links.",
      advertisedCapabilities: [
        "mobility.rides.estimate",
        "mobility.rides.request",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 4000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 26. Zomato Food Delivery (Official MCP & Deep Link)
    this.register({
      providerId: "zomato_eats",
      displayName: "Zomato",
      category: "productivity",
      description: "Restaurant search, menu inspection, automated food cart assembly, and payment generation.",
      advertisedCapabilities: [
        "commerce.food.search_restaurants",
        "commerce.food.get_menu",
        "commerce.food.create_cart",
        "commerce.food.order_checkout",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 7000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 27. Zepto Quick Commerce (Official MCP & 10-Min Delivery)
    this.register({
      providerId: "zepto_commerce",
      displayName: "Zepto",
      category: "productivity",
      description: "10-minute grocery delivery, dark-store live inventory search, cart sync, and checkout.",
      advertisedCapabilities: [
        "commerce.quick.search_catalog",
        "commerce.quick.create_cart",
        "commerce.quick.get_eta",
        "commerce.quick.checkout",
        "commerce.quick.view_cart",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 6000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 28. Swiggy Suite (Food & Instamart MCP)
    this.register({
      providerId: "swiggy_suite",
      displayName: "Swiggy",
      category: "productivity",
      description: "Swiggy Food & Instamart quick commerce catalog search, cart assembly, and express ordering.",
      advertisedCapabilities: [
        "commerce.food.search_restaurants",
        "commerce.food.create_cart",
        "commerce.quick.search_catalog",
        "commerce.quick.create_cart",
        "commerce.quick.view_cart",
      ],
      transportType: "STREAMABLE_HTTP",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 7000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });

    // 29. Autonomous Browser Shopping Agent (Playwright / CDP)
    this.register({
      providerId: "aven_browser_agent",
      displayName: "Aven Browser Shopper",
      category: "productivity",
      description: "Autonomous Chromium browser agent that navigates storefronts, adds items to cart, and halts at payment gate.",
      advertisedCapabilities: [
        "shopping.browser.search_and_cart",
        "shopping.browser.checkout_gate",
      ],
      transportType: "LOCAL_STDIO",
      authType: "NONE",
      requiredScopes: [],
      defaultTimeoutMs: 12000,
      circuitBreakerThreshold: 3,
      lifecycleState: "ACTIVE",
    });
  }
}
