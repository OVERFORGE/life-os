/**
 * ExternalCapabilityContracts.ts
 *
 * Sovereign LifeOS External Capability Contracts.
 * Strict type safety: ZERO `any`, ZERO dynamic fuzzy routing.
 * Every capability is typed via CapabilityParameterMap and CapabilityResultMap.
 */

import { AgentDomain } from "./AgentContracts";
import { OperationRiskClass } from "./SemanticTurnContracts";

/**
 * Canonical Capability URNs organized strictly under existing LifeOS cognitive domains.
 */
export type CapabilityURN =
  // Productivity Domain (Work, Coordination, Scheduling, Code)
  | "productivity.calendar.create_event"
  | "productivity.calendar.read_events"
  | "productivity.calendar.delete_event"
  | "productivity.calendar.update_event"
  | "productivity.email.send_message"
  | "productivity.email.create_draft"
  | "productivity.email.search_messages"
  | "productivity.email.read_thread"
  | "productivity.email.read_message"
  | "productivity.task.create_external"
  | "productivity.task.sync_tasks"
  | "productivity.git.create_issue"
  | "productivity.git.list_prs"
  | "productivity.git.list_repos"
  | "productivity.git.search_code"
  | "productivity.storage.read_file"
  | "productivity.storage.write_file"
  | "productivity.storage.list_files"
  | "productivity.contacts.search_contacts"
  | "productivity.contacts.get_contact"
  // Health Domain (Biometrics, Workouts, Nutrition)
  | "health.activity.record_workout"
  | "health.activity.sync_telemetry"
  | "health.biometrics.read_sleep"
  | "health.biometrics.read_daily_summary"
  | "health.nutrition.log_food"
  // Wellness Domain (Media, Environment, Recovery, Smart Home)
  | "wellness.media.playback_control"
  | "wellness.media.read_current_track"
  | "wellness.smarthome.set_light_state"
  | "wellness.smarthome.set_thermostat"
  // Context Domain (System & Environment)
  | "context.system.read_clipboard"
  | "context.system.search_web"
  | "context.system.open_url"
  | "context.environment.read_weather"
  | "context.environment.get_forecast"
  // Travel & Mobility Domain
  | "travel.itinerary.generate"
  | "travel.places.search"
  | "travel.flights.search"
  | "travel.hotels.search"
  // Shopping Domain
  | "shopping.products.search"
  | "shopping.cart.add"
  // Mobility & Transportation Domain
  | "mobility.rides.estimate"
  | "mobility.rides.request"
  | "mobility.rides.status"
  | "mobility.rides.cancel"
  // Food & Dining Domain
  | "commerce.food.search_restaurants"
  | "commerce.food.get_menu"
  | "commerce.food.create_cart"
  | "commerce.food.order_checkout"
  // Quick Commerce Domain
  | "commerce.quick.search_catalog"
  | "commerce.quick.create_cart"
  | "commerce.quick.get_eta"
  | "commerce.quick.checkout"
  | "commerce.quick.view_cart"
  // Autonomous Browser Shopping Domain
  | "shopping.browser.search_and_cart"
  | "shopping.browser.checkout_gate";

/**
 * Strongly typed parameter definitions for every supported capability.
 */
export interface CapabilityParameterMap {
  "productivity.calendar.create_event": {
    title: string;
    startTime: string; // ISO 8601
    endTime: string;   // ISO 8601
    location?: string;
    attendees?: string[];
    description?: string;
  };
  "productivity.calendar.read_events": {
    timeMin: string;   // ISO 8601
    timeMax: string;   // ISO 8601
    query?: string;
  };
  "productivity.calendar.delete_event": {
    eventId: string;
    sendUpdates?: boolean;
  };
  "productivity.calendar.update_event": {
    eventId: string;
    title?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
  };
  "productivity.email.send_message": {
    to: string[];
    subject: string;
    bodyText: string;
    cc?: string[];
    attachments?: Array<{ filename: string; mimeType: string; contentBase64?: string }>;
  };
  "productivity.email.create_draft": {
    to?: string[];
    subject: string;
    bodyText: string;
    cc?: string[];
    bcc?: string[];
  };
  "productivity.email.search_messages": {
    query: string;
    maxResults?: number;
  };
  "productivity.email.read_thread": {
    threadId: string;
  };
  "productivity.email.read_message": {
    messageId?: string;
    query?: string;
    sender?: string;
    index?: number;
    intent?: "read" | "summarize";
    summarize?: boolean;
  };
  "productivity.task.create_external": {
    title: string;
    dueDate?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    projectKey?: string;
  };
  "productivity.task.sync_tasks": {
    modifiedSince?: string;
  };
  "productivity.git.create_issue": {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: string[];
  };
  "productivity.git.list_prs": {
    owner?: string;
    repo?: string;
    state?: "open" | "closed" | "all";
  };
  "productivity.git.list_repos": {
    per_page?: number;
    sort?: "created" | "updated" | "pushed" | "full_name";
    type?: "all" | "owner" | "public" | "private" | "member";
  };
  "productivity.git.search_code": {
    query: string;
    repo?: string;
  };
  "productivity.storage.read_file": {
    path: string;
    encoding?: "utf-8" | "base64";
  };
  "productivity.storage.write_file": {
    path: string;
    content: string;
    overwrite?: boolean;
  };
  "productivity.storage.list_files": {
    path?: string;
    pattern?: string;
    extension?: string;
    recursive?: boolean;
  };
  "productivity.contacts.search_contacts": {
    query: string;
    maxResults?: number;
  };
  "productivity.contacts.get_contact": {
    contactId: string;
  };
  "health.activity.record_workout": {
    workoutType: string;
    durationMinutes: number;
    caloriesBurned?: number;
    distanceMeters?: number;
    heartRateAvg?: number;
  };
  "health.activity.sync_telemetry": {
    startDate: string;
  };
  "health.biometrics.read_sleep": {
    date: string; // YYYY-MM-DD
  };
  "health.biometrics.read_daily_summary": {
    date?: string; // YYYY-MM-DD or "today"
    days?: number; // e.g. 7 for past week
    range?: string; // "today", "yesterday", "week", "last_7_days"
    startDate?: string;
    endDate?: string;
  };
  "health.nutrition.log_food": {
    mealName: string;
    calories: number;
    proteinGrams?: number;
    carbsGrams?: number;
    fatGrams?: number;
  };
  "wellness.media.playback_control": {
    command: "PLAY" | "PAUSE" | "NEXT" | "PREVIOUS" | "RESUME";
    query?: string;
    volumePercent?: number;
  };
  "wellness.media.read_current_track": {
    includeContext?: boolean;
  };
  "wellness.smarthome.set_light_state": {
    entityId: string;
    power: "ON" | "OFF";
    brightnessPercent?: number;
    colorHex?: string;
  };
  "wellness.smarthome.set_thermostat": {
    entityId: string;
    targetTemperatureCelsius: number;
  };
  "context.system.read_clipboard": {
    maxCharacters?: number;
  };
  "context.system.search_web": {
    query: string;
    maxResults?: number;
  };
  "context.system.open_url": {
    url: string;
  };
  "context.environment.read_weather": {
    location?: string;
    latitude?: number;
    longitude?: number;
  };
  "context.environment.get_forecast": {
    location?: string;
    latitude?: number;
    longitude?: number;
    days?: number;
  };
  "travel.itinerary.generate": {
    destination: string;
    durationDays?: number;
    preferences?: string[];
    budget?: string;
  };
  "travel.places.search": {
    location: string;
    category?: string;
    query?: string;
  };
  "travel.flights.search": {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    passengers?: number;
    cabinClass?: string;
  };
  "travel.hotels.search": {
    location: string;
    checkInDate?: string;
    checkOutDate?: string;
    guests?: number;
    rooms?: number;
  };
  "shopping.products.search": {
    query: string;
    maxPrice?: number;
    platform?: "amazon" | "walmart" | "flipkart" | "all";
  };
  "shopping.cart.add": {
    productUrl: string;
    quantity?: number;
  };
  "mobility.rides.estimate": {
    pickup: string;
    dropoff: string;
    pickupCoords?: { lat: number; lng: number };
    dropoffCoords?: { lat: number; lng: number };
    tier?: "all" | "economy" | "premium" | "auto" | "bike";
  };
  "mobility.rides.request": {
    provider: "uber" | "ola" | "rapido";
    rideTier: string;
    pickup: string;
    dropoff: string;
    fareEstimate: string;
    pickupCoords?: { lat: number; lng: number };
    dropoffCoords?: { lat: number; lng: number };
  };
  "mobility.rides.status": {
    rideId: string;
    provider: "uber" | "ola" | "rapido";
  };
  "mobility.rides.cancel": {
    rideId: string;
    provider: "uber" | "ola" | "rapido";
    reason?: string;
  };
  "commerce.food.search_restaurants": {
    query?: string;
    cuisine?: string;
    location?: string;
    minRating?: number;
    platform?: "zomato" | "swiggy" | "all";
  };
  "commerce.food.get_menu": {
    restaurantId: string;
    restaurantName: string;
    platform?: "zomato" | "swiggy";
  };
  "commerce.food.create_cart": {
    restaurantName: string;
    items: Array<{ name: string; quantity: number; price?: string }>;
    deliveryAddress?: string;
    platform?: "zomato" | "swiggy";
  };
  "commerce.food.order_checkout": {
    cartId: string;
    paymentMethod?: "UPI" | "CARD" | "CASH";
  };
  "commerce.quick.search_catalog": {
    query: string;
    category?: string;
    platform?: "zepto" | "blinkit" | "instamart" | "all";
    location?: string;
  };
  "commerce.quick.create_cart": {
    items: Array<{ name: string; quantity: number; brand?: string }>;
    platform?: "zepto" | "blinkit" | "instamart";
    deliveryAddress?: string;
  };
  "commerce.quick.get_eta": {
    platform?: "zepto" | "blinkit" | "instamart";
    location?: string;
  };
  "commerce.quick.checkout": {
    cartId: string;
    deliverySlot?: string;
  };
  "commerce.quick.view_cart": {
    cartId?: string;
    platform?: "zepto" | "blinkit" | "instamart";
  };
  "shopping.browser.search_and_cart": {
    productName: string;
    store?: "amazon" | "flipkart" | "walmart" | "any";
    maxPrice?: number;
    preferredColor?: string;
    action?: "search" | "add_to_cart" | "navigate_to_checkout";
    deliveryAddress?: string;
  };
  "shopping.browser.checkout_gate": {
    productName: string;
    store: string;
    cartTotal: string;
    deliveryAddress: string;
    estimatedDelivery: string;
    checkoutUrl: string;
  };
}

/**
 * Strongly typed return value definitions for every supported capability.
 */
export interface CapabilityResultMap {
  "productivity.calendar.create_event": {
    eventId: string;
    htmlLink?: string;
    status: "confirmed" | "tentative";
  };
  "productivity.calendar.read_events": {
    events: Array<{
      id: string;
      title: string;
      startTime: string;
      endTime: string;
      location?: string;
    }>;
  };
  "productivity.calendar.delete_event": {
    deleted: boolean;
    eventId: string;
  };
  "productivity.calendar.update_event": {
    updated: boolean;
    eventId: string;
  };
  "productivity.email.send_message": {
    messageId: string;
    threadId?: string;
    sentAt: number;
  };
  "productivity.email.create_draft": {
    draftId: string;
    messageId: string;
    subject: string;
    to?: string[];
    createdAt: number;
    url?: string;
  };
  "productivity.email.search_messages": {
    messages: Array<{
      id: string;
      from: string;
      subject: string;
      date: string;
      snippet: string;
    }>;
  };
  "productivity.email.read_thread": {
    threadId: string;
    messages: Array<{ id: string; from: string; bodyText: string }>;
  };
  "productivity.email.read_message": {
    id: string;
    threadId?: string;
    from: string;
    to?: string;
    subject: string;
    date: string;
    snippet?: string;
    bodyText: string;
  };
  "productivity.task.create_external": {
    externalId: string;
    url?: string;
  };
  "productivity.task.sync_tasks": {
    tasks: Array<{ externalId: string; title: string; completed: boolean }>;
  };
  "productivity.git.create_issue": {
    issueNumber: number;
    url: string;
  };
  "productivity.git.list_prs": {
    pullRequests: Array<{ number: number; title: string; author: string; url: string }>;
  };
  "productivity.git.list_repos": {
    repositories: Array<{
      id: number;
      name: string;
      fullName: string;
      isPrivate: boolean;
      htmlUrl: string;
      description?: string;
      language?: string;
      updatedAt?: string;
    }>;
  };
  "productivity.git.search_code": {
    matches: Array<{ path: string; line: number; snippet: string }>;
  };
  "productivity.storage.read_file": {
    content: string;
    byteLength: number;
  };
  "productivity.storage.write_file": {
    bytesWritten: number;
    path: string;
  };
  "productivity.storage.list_files": {
    files: Array<{
      name: string;
      path: string;
      sizeBytes?: number;
      isDirectory: boolean;
    }>;
    totalCount: number;
    searchDirectory: string;
  };
  "productivity.contacts.search_contacts": {
    contacts: Array<{
      id: string;
      name: string;
      email?: string;
      phone?: string;
      company?: string;
    }>;
  };
  "productivity.contacts.get_contact": {
    contact: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
      company?: string;
    };
  };
  "health.activity.record_workout": {
    activityId: string;
    logged: boolean;
  };
  "health.activity.sync_telemetry": {
    syncedCount: number;
  };
  "health.biometrics.read_sleep": {
    score?: number;
    durationMinutes: number;
    deepSleepMinutes?: number;
  };
  "health.biometrics.read_daily_summary": {
    steps: number;
    activeCalories: number;
    activeMinutes?: number;
    totalSteps?: number;
    dailyAverage?: number;
    totalCalories?: number;
    isRange?: boolean;
    rangeDays?: number;
    dailyBreakdown?: Array<{
      date: string;
      dayLabel: string;
      steps: number;
      activeCalories: number;
      activeMinutes: number;
    }>;
  };
  "health.nutrition.log_food": {
    logged: boolean;
    logId: string;
  };
  "wellness.media.playback_control": {
    success: boolean;
    isPlaying: boolean;
  };
  "wellness.media.read_current_track": {
    isPlaying: boolean;
    trackTitle?: string;
    artist?: string;
  };
  "wellness.smarthome.set_light_state": {
    entityId: string;
    state: "ON" | "OFF";
  };
  "wellness.smarthome.set_thermostat": {
    entityId: string;
    currentTemperatureCelsius: number;
  };
  "context.system.read_clipboard": {
    text: string;
  };
  "context.system.search_web": {
    results: Array<{ title: string; url: string; snippet: string }>;
  };
  "context.system.open_url": {
    success: boolean;
    url: string;
    opened: boolean;
  };
  "context.environment.read_weather": {
    location: string;
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    weatherDescription: string;
    weatherCode: number;
    windSpeed: number;
    uvIndex?: number;
  };
  "context.environment.get_forecast": {
    location: string;
    temperature: number;
    forecast: Array<{
      date: string;
      maxTemp: number;
      minTemp: number;
      weatherDescription: string;
      precipitationProb: number;
    }>;
  };
  "travel.itinerary.generate": {
    destination: string;
    durationDays: number;
    summary: string;
    attractions: Array<{
      name: string;
      type: string;
      description?: string;
      coordinates?: { lat: number; lon: number };
    }>;
    dailyPlan: Array<{
      day: number;
      title: string;
      activities: string[];
    }>;
  };
  "travel.places.search": {
    location: string;
    places: Array<{
      name: string;
      category: string;
      address?: string;
      rating?: number;
      website?: string;
    }>;
  };
  "travel.flights.search": {
    origin: string;
    destination: string;
    departureDate: string;
    flights: Array<{
      airline: string;
      flightNumber?: string;
      departureTime: string;
      arrivalTime: string;
      duration: string;
      stops: number;
      price?: string;
      bookingUrl: string;
    }>;
    bookingUrl: string;
  };
  "travel.hotels.search": {
    location: string;
    hotels: Array<{
      name: string;
      address?: string;
      stars?: number;
      estimatedPrice?: string;
      bookingUrl: string;
    }>;
    searchUrl: string;
  };
  "shopping.products.search": {
    query: string;
    products: Array<{
      title: string;
      price: string;
      rating?: string;
      reviewsCount?: string;
      platform: string;
      productUrl: string;
      thumbnail?: string;
    }>;
  };
  "shopping.cart.add": {
    success: boolean;
    productUrl: string;
    checkoutUrl: string;
    message: string;
  };
  "mobility.rides.estimate": {
    pickup: string;
    dropoff: string;
    options: Array<{
      provider: "uber" | "ola" | "rapido";
      providerName: string;
      tier: string;
      price: string;
      etaMinutes: number;
      deepLinkUri: string;
    }>;
  };
  "mobility.rides.request": {
    success: boolean;
    rideId: string;
    provider: string;
    rideTier: string;
    pickup: string;
    dropoff: string;
    fareEstimate: string;
    driverEtaMinutes?: number;
    trackingUrl?: string;
    deepLinkUri?: string;
  };
  "mobility.rides.status": {
    rideId: string;
    status: "DRIVER_ASSIGNED" | "ARRIVING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
    driverName?: string;
    vehiclePlate?: string;
    etaMinutes?: number;
  };
  "mobility.rides.cancel": {
    success: boolean;
    rideId: string;
    refundStatus?: string;
  };
  "commerce.food.search_restaurants": {
    location: string;
    restaurants: Array<{
      id: string;
      name: string;
      cuisine: string;
      rating: number;
      etaMinutes: number;
      platform: "zomato" | "swiggy";
      menuHighlights: string[];
      deepLinkUrl: string;
    }>;
  };
  "commerce.food.get_menu": {
    restaurantId: string;
    restaurantName: string;
    items: Array<{
      id: string;
      name: string;
      price: string;
      isVeg?: boolean;
      description?: string;
    }>;
  };
  "commerce.food.create_cart": {
    cartId: string;
    restaurantName: string;
    items: Array<{ name: string; quantity: number; price?: string }>;
    subtotal: string;
    deliveryFee: string;
    totalAmount: string;
    platform: string;
    checkoutUrl: string;
    deepLinkUrl: string;
  };
  "commerce.food.order_checkout": {
    orderId: string;
    status: "AWAITING_PAYMENT" | "PLACED";
    totalAmount: string;
    paymentUrl: string;
  };
  "commerce.quick.search_catalog": {
    query: string;
    items: Array<{
      id: string;
      name: string;
      packSize: string;
      price: string;
      inStock: boolean;
      etaMinutes: number;
      platform: "zepto" | "blinkit" | "instamart";
      deepLinkUrl: string;
    }>;
  };
  "commerce.quick.create_cart": {
    cartId: string;
    items: Array<{ name: string; quantity: number; price: string }>;
    totalAmount: string;
    etaMinutes: number;
    platform: string;
    checkoutUrl: string;
    deepLinkUrl: string;
  };
  "commerce.quick.get_eta": {
    etaMinutes: number;
    darkStorePincode?: string;
    platform: string;
  };
  "commerce.quick.checkout": {
    checkoutId: string;
    totalAmount: string;
    deliverySlot: string;
    paymentUrl: string;
  };
  "commerce.quick.view_cart": {
    cartId: string;
    items: Array<{ name: string; quantity: number; price: string }>;
    totalAmount: string;
    etaMinutes: number;
    platform: string;
    checkoutUrl: string;
    deepLinkUrl: string;
  };
  "shopping.browser.search_and_cart": {
    success: boolean;
    productTitle: string;
    store: string;
    price: string;
    inStock: boolean;
    cartStatus: "ADDED_TO_CART" | "CHECKOUT_READY";
    deliveryAddress?: string;
    checkoutUrl: string;
    deepLinkUrl: string;
    gateScreenshot?: string;
  };
  "shopping.browser.checkout_gate": {
    orderSummary: string;
    store: string;
    totalAmount: string;
    deliveryAddress: string;
    estimatedDelivery: string;
    requiresUserPaymentAuth: true;
    paymentUrl: string;
    deepLinkUrl: string;
  };
}

export type ProviderId =
  | "google_calendar"
  | "google_tasks"
  | "gmail"
  | "google_drive"
  | "google_contacts"
  | "google_fit"
  | "spotify"
  | "github"
  | "linear"
  | "slack"
  | "notion"
  | "obsidian_vault"
  | "home_assistant"
  | "philips_hue"
  | "apple_health_bridge"
  | "health_connect_bridge"
  | "filesystem_desktop"
  | "brave_search"
  | "open_meteo"
  | "openstreetmap_travel"
  | "flight_tracker"
  | "hotel_finder"
  | "shopping_agent"
  | "uber_mobility"
  | "ola_mobility"
  | "rapido_mobility"
  | "zomato_eats"
  | "zepto_commerce"
  | "swiggy_suite"
  | "aven_browser_agent";

export interface ExternalCapabilityPayload<T extends CapabilityURN = CapabilityURN> {
  capabilityURN: T;
  providerId: ProviderId;
  parameters: CapabilityParameterMap[T];
  policy?: {
    timeoutMs?: number;
    retryLimit?: number;
    retryBackoffMs?: number;
    idempotencyWindowSeconds?: number;
    rateLimitTier?: "CRITICAL" | "HIGH" | "NORMAL" | "BATCH";
    failureClassification?: "RETRYABLE_TRANSIENT" | "UNKNOWN_EXTERNAL_STATE" | "FATAL_PERMANENT";
  };
  confirmationToken?: string;
}

export type ConfirmationMode =
  | "ZERO_CONFIRMATION"
  | "IMPLICIT_UNDO_WINDOW"
  | "EXPLICIT_CONFIRMATION"
  | "STRONG_BIOMETRIC_CONFIRMATION";

export type CompensationGuarantee =
  | "ATOMIC_REVERSIBLE"
  | "REVERSIBLE_WITH_COMPENSATION"
  | "IRREVERSIBLE_EXTERNAL"
  | "MANUAL_REVIEW_REQUIRED";

export interface CapabilityPolicy {
  riskClass: OperationRiskClass;
  confirmationMode: ConfirmationMode;
  compensationGuarantees: CompensationGuarantee;
  unknownStatePolicy: "HALT_COMPENSATION_AND_RECONCILE";
}

/**
 * Deterministic presentation metadata: translates capability URNs into
 * calm, non-technical, human-readable labels and Lucide icon identifiers (NO EMOJIS).
 */
export interface CapabilityPresentation {
  capabilityURN: CapabilityURN;
  displayName: string;
  providerDisplayName: string;
  iconName: string; // Lucide icon identifier e.g. "Calendar", "Mail", "Music", "FolderGit2"
  actionLabel: string; // e.g. "Checking calendar"
  progressPhrase: string; // e.g. "Looking at tomorrow's schedule..."
  completedPhrase: string; // e.g. "Calendar checked"
  failedPhrase: string; // e.g. "Couldn't reach calendar"
}

export interface TransportRequest<T extends CapabilityURN = CapabilityURN> {
  capabilityURN: T;
  parameters: CapabilityParameterMap[T];
  metadata: {
    idempotencyKey: string;
    userId: string;
    providerId: ProviderId;
  };
}

export interface TransportResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs?: number;
}

export interface ITransportClient {
  transportType: "LOCAL_STDIO" | "STREAMABLE_HTTP" | "SSE" | "NATIVE_BRIDGE";
  execute(request: TransportRequest): Promise<TransportResponse>;
  testConnection(): Promise<boolean>;
  close(): Promise<void>;
}

