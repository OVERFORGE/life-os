/**
 * CapabilityPresentationRegistry.ts
 *
 * Deterministic presentation metadata: translates capability URNs into
 * calm, non-technical, human-readable labels and Lucide icon identifiers (NO EMOJIS).
 */

import { CapabilityPresentation, CapabilityURN, ProviderId } from "../../contracts/ExternalCapabilityContracts";

export class CapabilityPresentationRegistry {
  private static instance: CapabilityPresentationRegistry;
  private presentations: Map<CapabilityURN, CapabilityPresentation> = new Map();

  constructor() {
    this.registerDefaults();
  }

  static getInstance(): CapabilityPresentationRegistry {
    if (!CapabilityPresentationRegistry.instance) {
      CapabilityPresentationRegistry.instance = new CapabilityPresentationRegistry();
    }
    return CapabilityPresentationRegistry.instance;
  }

  get(capabilityURN: CapabilityURN, providerIdHint?: string): CapabilityPresentation {
    const found = this.presentations.get(capabilityURN);
    if (found) {
      if (providerIdHint) {
        const customProviders: Record<string, { name: string; icon: string }> = {
          google_drive: { name: "Google Drive", icon: "Cloud" },
          drive: { name: "Google Drive", icon: "Cloud" },
          notion: { name: "Notion", icon: "BookOpen" },
          obsidian_vault: { name: "Obsidian", icon: "FileCode" },
          obsidian: { name: "Obsidian", icon: "FileCode" },
          github: { name: "GitHub", icon: "FolderGit2" },
          gmail: { name: "Gmail", icon: "Mail" },
          google_contacts: { name: "Google Contacts", icon: "Users" },
          contacts: { name: "Google Contacts", icon: "Users" },
          google_fit: { name: "Google Fit", icon: "Activity" },
          fit: { name: "Google Fit", icon: "Activity" },
          google_calendar: { name: "Google Calendar", icon: "Calendar" },
          calendar: { name: "Google Calendar", icon: "Calendar" },
          google_tasks: { name: "Google Tasks", icon: "CheckSquare" },
          tasks: { name: "Google Tasks", icon: "CheckSquare" },
          filesystem_desktop: { name: "Local Filesystem", icon: "HardDrive" },
          filesystem: { name: "Local Filesystem", icon: "HardDrive" },
          desktop: { name: "Local Filesystem", icon: "HardDrive" },
        };
        const override = customProviders[providerIdHint];
        if (override) {
          return {
            ...found,
            providerDisplayName: override.name,
            iconName: override.icon,
          };
        }
      }
      return found;
    }

    // Fallback: humanize the URN cleanly
    const parts = capabilityURN.split(".");
    const action = parts[parts.length - 1].replace(/_/g, " ");
    const providerName = providerIdHint
      ? providerIdHint.charAt(0).toUpperCase() + providerIdHint.slice(1).replace(/_/g, " ")
      : parts[1] || parts[0] || "Service";

    return {
      capabilityURN,
      displayName: action,
      providerDisplayName: providerName,
      iconName: "Activity",
      actionLabel: action,
      progressPhrase: `Executing ${action}...`,
      completedPhrase: `Completed ${action}`,
      failedPhrase: `Failed ${action}`,
    };
  }

  private registerDefaults(): void {
    // 1. Google Calendar
    this.presentations.set("productivity.calendar.read_events", {
      capabilityURN: "productivity.calendar.read_events",
      displayName: "Calendar Events",
      providerDisplayName: "Google Calendar",
      iconName: "Calendar",
      actionLabel: "Checking calendar",
      progressPhrase: "Looking at your schedule...",
      completedPhrase: "Schedule checked",
      failedPhrase: "Couldn't load calendar",
    });

    this.presentations.set("productivity.calendar.create_event", {
      capabilityURN: "productivity.calendar.create_event",
      displayName: "Calendar Event",
      providerDisplayName: "Google Calendar",
      iconName: "CalendarPlus",
      actionLabel: "Adding to calendar",
      progressPhrase: "Scheduling event...",
      completedPhrase: "Event added to calendar",
      failedPhrase: "Couldn't create event",
    });

    this.presentations.set("productivity.calendar.delete_event", {
      capabilityURN: "productivity.calendar.delete_event",
      displayName: "Calendar Event",
      providerDisplayName: "Google Calendar",
      iconName: "CalendarX",
      actionLabel: "Removing from calendar",
      progressPhrase: "Removing event...",
      completedPhrase: "Event removed",
      failedPhrase: "Couldn't delete event",
    });

    this.presentations.set("productivity.calendar.update_event", {
      capabilityURN: "productivity.calendar.update_event",
      displayName: "Calendar Event",
      providerDisplayName: "Google Calendar",
      iconName: "Calendar",
      actionLabel: "Updating calendar",
      progressPhrase: "Updating event details...",
      completedPhrase: "Event updated",
      failedPhrase: "Couldn't update event",
    });

    // 2. Email (Gmail / Outlook)
    this.presentations.set("productivity.email.send_message", {
      capabilityURN: "productivity.email.send_message",
      displayName: "Email",
      providerDisplayName: "Gmail",
      iconName: "Mail",
      actionLabel: "Sending email",
      progressPhrase: "Sending message...",
      completedPhrase: "Email sent",
      failedPhrase: "Couldn't send email",
    });

    this.presentations.set("productivity.email.create_draft", {
      capabilityURN: "productivity.email.create_draft",
      displayName: "Email Draft",
      providerDisplayName: "Gmail",
      iconName: "FileEdit",
      actionLabel: "Drafting email",
      progressPhrase: "Creating email draft...",
      completedPhrase: "Draft saved to Gmail",
      failedPhrase: "Couldn't create draft",
    });

    this.presentations.set("productivity.email.search_messages", {
      capabilityURN: "productivity.email.search_messages",
      displayName: "Email Search",
      providerDisplayName: "Gmail",
      iconName: "MailSearch",
      actionLabel: "Searching email",
      progressPhrase: "Searching your inbox...",
      completedPhrase: "Inbox search complete",
      failedPhrase: "Couldn't search email",
    });

    this.presentations.set("productivity.email.read_thread", {
      capabilityURN: "productivity.email.read_thread",
      displayName: "Email Thread",
      providerDisplayName: "Gmail",
      iconName: "MailOpen",
      actionLabel: "Reading email",
      progressPhrase: "Loading message...",
      completedPhrase: "Email loaded",
      failedPhrase: "Couldn't read email",
    });

    this.presentations.set("productivity.email.read_message", {
      capabilityURN: "productivity.email.read_message",
      displayName: "Email Message",
      providerDisplayName: "Gmail",
      iconName: "MailOpen",
      actionLabel: "Opening email",
      progressPhrase: "Opening email...",
      completedPhrase: "Email loaded",
      failedPhrase: "Couldn't open email",
    });

    // 3. Spotify / Media
    this.presentations.set("wellness.media.playback_control", {
      capabilityURN: "wellness.media.playback_control",
      displayName: "Music",
      providerDisplayName: "Spotify",
      iconName: "Music",
      actionLabel: "Controlling music",
      progressPhrase: "Connecting to playback...",
      completedPhrase: "Playback updated",
      failedPhrase: "Couldn't reach Spotify",
    });

    this.presentations.set("wellness.media.read_current_track", {
      capabilityURN: "wellness.media.read_current_track",
      displayName: "Now Playing",
      providerDisplayName: "Spotify",
      iconName: "Headphones",
      actionLabel: "Checking current music",
      progressPhrase: "Looking up current track...",
      completedPhrase: "Track verified",
      failedPhrase: "Couldn't check music",
    });

    // 4. GitHub
    this.presentations.set("productivity.git.create_issue", {
      capabilityURN: "productivity.git.create_issue",
      displayName: "GitHub Issue",
      providerDisplayName: "GitHub",
      iconName: "FolderGit2",
      actionLabel: "Creating issue",
      progressPhrase: "Opening issue on GitHub...",
      completedPhrase: "Issue created",
      failedPhrase: "Couldn't open issue",
    });

    this.presentations.set("productivity.git.list_prs", {
      capabilityURN: "productivity.git.list_prs",
      displayName: "Pull Requests",
      providerDisplayName: "GitHub",
      iconName: "GitPullRequest",
      actionLabel: "Checking pull requests",
      progressPhrase: "Looking up open PRs...",
      completedPhrase: "PRs loaded",
      failedPhrase: "Couldn't load PRs",
    });

    this.presentations.set("productivity.git.list_repos", {
      capabilityURN: "productivity.git.list_repos",
      displayName: "GitHub Repositories",
      providerDisplayName: "GitHub",
      iconName: "FolderGit2",
      actionLabel: "Listing repositories",
      progressPhrase: "Fetching your GitHub repositories...",
      completedPhrase: "Repositories loaded",
      failedPhrase: "Couldn't load repositories",
    });

    this.presentations.set("productivity.git.search_code", {
      capabilityURN: "productivity.git.search_code",
      displayName: "Code Search",
      providerDisplayName: "GitHub",
      iconName: "Code2",
      actionLabel: "Searching code",
      progressPhrase: "Searching repository...",
      completedPhrase: "Search complete",
      failedPhrase: "Couldn't search repository",
    });

    // 5. Filesystem Desktop
    this.presentations.set("productivity.storage.read_file", {
      capabilityURN: "productivity.storage.read_file",
      displayName: "Local File",
      providerDisplayName: "Filesystem",
      iconName: "FileText",
      actionLabel: "Reading file",
      progressPhrase: "Accessing local file...",
      completedPhrase: "File loaded",
      failedPhrase: "Couldn't read file",
    });

    this.presentations.set("productivity.storage.write_file", {
      capabilityURN: "productivity.storage.write_file",
      displayName: "Local File",
      providerDisplayName: "Filesystem",
      iconName: "FileCheck",
      actionLabel: "Writing file",
      progressPhrase: "Saving to disk...",
      completedPhrase: "File saved",
      failedPhrase: "Couldn't save file",
    });

    this.presentations.set("productivity.storage.list_files", {
      capabilityURN: "productivity.storage.list_files",
      displayName: "Desktop Files",
      providerDisplayName: "Local Filesystem",
      iconName: "HardDrive",
      actionLabel: "Checking files",
      progressPhrase: "Checking your local files...",
      completedPhrase: "Files checked",
      failedPhrase: "Couldn't access files",
    });

    // 6. Web Search
    this.presentations.set("context.system.search_web", {
      capabilityURN: "context.system.search_web",
      displayName: "Web Search",
      providerDisplayName: "Search",
      iconName: "Globe",
      actionLabel: "Searching web",
      progressPhrase: "Finding latest information...",
      completedPhrase: "Information retrieved",
      failedPhrase: "Search unavailable",
    });

    this.presentations.set("context.system.open_url", {
      capabilityURN: "context.system.open_url",
      displayName: "Browser",
      providerDisplayName: "System",
      iconName: "Globe",
      actionLabel: "Opening browser",
      progressPhrase: "Opening browser...",
      completedPhrase: "Opened in browser",
      failedPhrase: "Couldn't open browser",
    });

    // 7. Smart Home
    this.presentations.set("wellness.smarthome.set_light_state", {
      capabilityURN: "wellness.smarthome.set_light_state",
      displayName: "Lights",
      providerDisplayName: "Smart Home",
      iconName: "Lightbulb",
      actionLabel: "Adjusting lights",
      progressPhrase: "Updating light settings...",
      completedPhrase: "Lights adjusted",
      failedPhrase: "Couldn't reach smart home",
    });

    // 8. Health
    this.presentations.set("health.activity.record_workout", {
      capabilityURN: "health.activity.record_workout",
      displayName: "Workout",
      providerDisplayName: "Health",
      iconName: "Activity",
      actionLabel: "Logging workout",
      progressPhrase: "Recording activity...",
      completedPhrase: "Workout logged",
      failedPhrase: "Couldn't record activity",
    });

    this.presentations.set("health.biometrics.read_daily_summary", {
      capabilityURN: "health.biometrics.read_daily_summary",
      displayName: "Daily Health Summary",
      providerDisplayName: "Google Fit",
      iconName: "Activity",
      actionLabel: "Checking health activity",
      progressPhrase: "Reading daily activity...",
      completedPhrase: "Activity summary loaded",
      failedPhrase: "Couldn't read activity summary",
    });

    this.presentations.set("health.activity.sync_telemetry", {
      capabilityURN: "health.activity.sync_telemetry",
      displayName: "Health Telemetry",
      providerDisplayName: "Google Fit",
      iconName: "Activity",
      actionLabel: "Syncing health telemetry",
      progressPhrase: "Syncing activity data...",
      completedPhrase: "Telemetry synced",
      failedPhrase: "Couldn't sync telemetry",
    });

    // 9. Contacts
    this.presentations.set("productivity.contacts.search_contacts", {
      capabilityURN: "productivity.contacts.search_contacts",
      displayName: "Contacts",
      providerDisplayName: "Google Contacts",
      iconName: "Users",
      actionLabel: "Searching contacts",
      progressPhrase: "Searching your contacts...",
      completedPhrase: "Contacts retrieved",
      failedPhrase: "Couldn't access contacts",
    });

    this.presentations.set("productivity.contacts.get_contact", {
      capabilityURN: "productivity.contacts.get_contact",
      displayName: "Contact Details",
      providerDisplayName: "Google Contacts",
      iconName: "User",
      actionLabel: "Retrieving contact",
      progressPhrase: "Looking up contact details...",
      completedPhrase: "Contact details loaded",
      failedPhrase: "Couldn't load contact",
    });

    // 10. Weather (Open-Meteo)
    this.presentations.set("context.environment.read_weather", {
      capabilityURN: "context.environment.read_weather",
      displayName: "Live Weather",
      providerDisplayName: "Open-Meteo",
      iconName: "CloudSun",
      actionLabel: "Checking weather",
      progressPhrase: "Reading live weather telemetry...",
      completedPhrase: "Weather loaded",
      failedPhrase: "Couldn't read weather",
    });

    this.presentations.set("context.environment.get_forecast", {
      capabilityURN: "context.environment.get_forecast",
      displayName: "Weather Forecast",
      providerDisplayName: "Open-Meteo",
      iconName: "CloudRain",
      actionLabel: "Getting forecast",
      progressPhrase: "Fetching 7-day forecast...",
      completedPhrase: "Forecast loaded",
      failedPhrase: "Couldn't load forecast",
    });

    // 11. Travel Planning & Places
    this.presentations.set("travel.itinerary.generate", {
      capabilityURN: "travel.itinerary.generate",
      displayName: "Travel Itinerary",
      providerDisplayName: "Travel Engine",
      iconName: "Compass",
      actionLabel: "Generating itinerary",
      progressPhrase: "Curating attractions and day-by-day plan...",
      completedPhrase: "Itinerary created",
      failedPhrase: "Couldn't generate itinerary",
    });

    this.presentations.set("travel.places.search", {
      capabilityURN: "travel.places.search",
      displayName: "Places & Sights",
      providerDisplayName: "OpenStreetMap",
      iconName: "MapPin",
      actionLabel: "Finding attractions",
      progressPhrase: "Searching top local sights...",
      completedPhrase: "Places found",
      failedPhrase: "Couldn't find places",
    });

    // 12. Flight Search
    this.presentations.set("travel.flights.search", {
      capabilityURN: "travel.flights.search",
      displayName: "Flight Offers",
      providerDisplayName: "Flight Engine",
      iconName: "Plane",
      actionLabel: "Searching flights",
      progressPhrase: "Scanning real-time airline routes & schedules...",
      completedPhrase: "Flight options ready",
      failedPhrase: "Couldn't search flights",
    });

    // 13. Hotel Search
    this.presentations.set("travel.hotels.search", {
      capabilityURN: "travel.hotels.search",
      displayName: "Hotel Stays",
      providerDisplayName: "Hotel Engine",
      iconName: "Building",
      actionLabel: "Searching accommodations",
      progressPhrase: "Locating top-rated hotels and stays...",
      completedPhrase: "Hotels found",
      failedPhrase: "Couldn't find hotels",
    });

    // 14. Automated Shopping
    this.presentations.set("shopping.products.search", {
      capabilityURN: "shopping.products.search",
      displayName: "Product Search",
      providerDisplayName: "Shopping Agent",
      iconName: "ShoppingBag",
      actionLabel: "Comparing product prices",
      progressPhrase: "Searching top retailers and comparing prices...",
      completedPhrase: "Products found",
      failedPhrase: "Couldn't search products",
    });

    this.presentations.set("shopping.cart.add", {
      capabilityURN: "shopping.cart.add",
      displayName: "Add to Cart",
      providerDisplayName: "Shopping Agent",
      iconName: "ShoppingCart",
      actionLabel: "Adding to cart",
      progressPhrase: "Preparing product cart addition...",
      completedPhrase: "Added to cart",
      failedPhrase: "Couldn't add to cart",
    });

    // 15. Mobility & Rides (Uber, Ola, Rapido)
    this.presentations.set("mobility.rides.estimate", {
      capabilityURN: "mobility.rides.estimate",
      displayName: "Ride Comparison",
      providerDisplayName: "Mobility Router",
      iconName: "Car",
      actionLabel: "Comparing rides",
      progressPhrase: "Scanning Uber, Ola, and Rapido options & fares...",
      completedPhrase: "Rides available",
      failedPhrase: "Couldn't find rides",
    });

    this.presentations.set("mobility.rides.request", {
      capabilityURN: "mobility.rides.request",
      displayName: "Request Ride",
      providerDisplayName: "Mobility Router",
      iconName: "Car",
      actionLabel: "Requesting ride",
      progressPhrase: "Dispatching ride request to driver network...",
      completedPhrase: "Ride requested",
      failedPhrase: "Couldn't request ride",
    });

    this.presentations.set("mobility.rides.status", {
      capabilityURN: "mobility.rides.status",
      displayName: "Ride Status",
      providerDisplayName: "Mobility Router",
      iconName: "Navigation",
      actionLabel: "Tracking ride",
      progressPhrase: "Checking driver GPS & arrival ETA...",
      completedPhrase: "Ride status updated",
      failedPhrase: "Couldn't track ride",
    });

    this.presentations.set("mobility.rides.cancel", {
      capabilityURN: "mobility.rides.cancel",
      displayName: "Cancel Ride",
      providerDisplayName: "Mobility Router",
      iconName: "XCircle",
      actionLabel: "Cancelling ride",
      progressPhrase: "Submitting cancellation request...",
      completedPhrase: "Ride cancelled",
      failedPhrase: "Couldn't cancel ride",
    });

    // 16. Food Delivery (Zomato, Swiggy)
    this.presentations.set("commerce.food.search_restaurants", {
      capabilityURN: "commerce.food.search_restaurants",
      displayName: "Restaurant Search",
      providerDisplayName: "Dining Engine",
      iconName: "Utensils",
      actionLabel: "Searching restaurants",
      progressPhrase: "Finding top dining options nearby...",
      completedPhrase: "Restaurants found",
      failedPhrase: "Couldn't find restaurants",
    });

    this.presentations.set("commerce.food.get_menu", {
      capabilityURN: "commerce.food.get_menu",
      displayName: "Restaurant Menu",
      providerDisplayName: "Dining Engine",
      iconName: "BookOpen",
      actionLabel: "Browsing menu",
      progressPhrase: "Retrieving dishes and specials...",
      completedPhrase: "Menu loaded",
      failedPhrase: "Couldn't load menu",
    });

    this.presentations.set("commerce.food.create_cart", {
      capabilityURN: "commerce.food.create_cart",
      displayName: "Food Basket",
      providerDisplayName: "Dining Engine",
      iconName: "ShoppingBag",
      actionLabel: "Assembling food cart",
      progressPhrase: "Building food order and calculating delivery fee...",
      completedPhrase: "Food cart ready",
      failedPhrase: "Couldn't assemble food cart",
    });

    this.presentations.set("commerce.food.order_checkout", {
      capabilityURN: "commerce.food.order_checkout",
      displayName: "Food Checkout",
      providerDisplayName: "Dining Engine",
      iconName: "CreditCard",
      actionLabel: "Preparing payment",
      progressPhrase: "Generating secure payment link...",
      completedPhrase: "Checkout link ready",
      failedPhrase: "Couldn't prepare checkout",
    });

    // 17. Quick Commerce (Zepto, Blinkit, Instamart)
    this.presentations.set("commerce.quick.search_catalog", {
      capabilityURN: "commerce.quick.search_catalog",
      displayName: "Quick Groceries",
      providerDisplayName: "Quick Commerce Engine",
      iconName: "Zap",
      actionLabel: "Searching dark store inventory",
      progressPhrase: "Scanning 10-minute grocery inventory...",
      completedPhrase: "Items in stock",
      failedPhrase: "Couldn't find items",
    });

    this.presentations.set("commerce.quick.create_cart", {
      capabilityURN: "commerce.quick.create_cart",
      displayName: "Quick Basket",
      providerDisplayName: "Quick Commerce Engine",
      iconName: "ShoppingBag",
      actionLabel: "Syncing quick cart",
      progressPhrase: "Locking inventory and checking delivery slot...",
      completedPhrase: "Quick basket ready",
      failedPhrase: "Couldn't create quick cart",
    });

    this.presentations.set("commerce.quick.get_eta", {
      capabilityURN: "commerce.quick.get_eta",
      displayName: "Delivery ETA",
      providerDisplayName: "Quick Commerce Engine",
      iconName: "Clock",
      actionLabel: "Checking delivery time",
      progressPhrase: "Estimating dark store dispatch time...",
      completedPhrase: "ETA calculated",
      failedPhrase: "Couldn't check ETA",
    });

    this.presentations.set("commerce.quick.checkout", {
      capabilityURN: "commerce.quick.checkout",
      displayName: "Quick Checkout",
      providerDisplayName: "Quick Commerce Engine",
      iconName: "CreditCard",
      actionLabel: "Initiating 10-min checkout",
      progressPhrase: "Locking cart and generating payment link...",
      completedPhrase: "Ready for payment",
      failedPhrase: "Couldn't initiate checkout",
    });

    // 18. Autonomous Browser Shopping Agent
    this.presentations.set("shopping.browser.search_and_cart", {
      capabilityURN: "shopping.browser.search_and_cart",
      displayName: "Browser Shopper",
      providerDisplayName: "Autonomous Browser Agent",
      iconName: "Globe",
      actionLabel: "Automating browser shopping",
      progressPhrase: "Navigating store, verifying price & adding to cart...",
      completedPhrase: "Cart prepared in browser",
      failedPhrase: "Couldn't complete browser shopping",
    });

    this.presentations.set("shopping.browser.checkout_gate", {
      capabilityURN: "shopping.browser.checkout_gate",
      displayName: "Checkout Payment Gate",
      providerDisplayName: "Autonomous Browser Agent",
      iconName: "ShieldCheck",
      actionLabel: "Holding at payment gate",
      progressPhrase: "Paused securely at checkout screen for user payment authorization...",
      completedPhrase: "Checkout screen ready",
      failedPhrase: "Couldn't reach checkout gate",
    });
  }
}
