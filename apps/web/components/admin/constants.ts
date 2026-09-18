export interface NavItem {
  title: string;
  href: string;
  icon?: string;
  isComingSoon?: boolean;
  isActivePage?: boolean;
  children?: NavItem[];
}

export interface NavSection {
  sectionTitle?: string;
  items: NavItem[];
}

export const ADMIN_ROUTES = {
  DASHBOARD: "/admin",
  KERNEL_LAB: {
    ROOT: "/admin/kernel-lab",
    SIMULATION: "/admin/kernel-lab/simulation",
    PERSONAS: "/admin/kernel-lab/personas",
    SCENARIOS: "/admin/kernel-lab/scenarios",
    REPLAY: "/admin/kernel-lab/replay",
    VALIDATION: "/admin/kernel-lab/validation",
    REGRESSION: "/admin/kernel-lab/regression",
    CHAOS: "/admin/kernel-lab/chaos",
    REPORTS: "/admin/kernel-lab/reports",
  },
  KERNEL: "/admin/kernel",
  ANALYTICS: "/admin/analytics",
  SETTINGS: "/admin/settings",
} as const;

export const ADMIN_NAVIGATION: NavSection[] = [
  {
    items: [
      {
        title: "Dashboard",
        href: ADMIN_ROUTES.DASHBOARD,
        icon: "LayoutDashboard",
        isActivePage: true,
      },
    ],
  },
  {
    sectionTitle: "LABORATORY",
    items: [
      {
        title: "Kernel Lab",
        href: ADMIN_ROUTES.KERNEL_LAB.SIMULATION,
        icon: "FlaskConical",
        children: [
          {
            title: "Simulation Lab",
            href: ADMIN_ROUTES.KERNEL_LAB.SIMULATION,
            icon: "Play",
            isActivePage: true,
          },
          {
            title: "Personas",
            href: ADMIN_ROUTES.KERNEL_LAB.PERSONAS,
            icon: "Users",
          },
          {
            title: "Scenarios",
            href: ADMIN_ROUTES.KERNEL_LAB.SCENARIOS,
            icon: "FileCode",
            isComingSoon: true,
          },
          {
            title: "Replay",
            href: ADMIN_ROUTES.KERNEL_LAB.REPLAY,
            icon: "History",
            isComingSoon: true,
          },
          {
            title: "Validation",
            href: ADMIN_ROUTES.KERNEL_LAB.VALIDATION,
            icon: "CheckCircle2",
            isComingSoon: true,
          },
          {
            title: "Regression",
            href: ADMIN_ROUTES.KERNEL_LAB.REGRESSION,
            icon: "GitCompare",
            isComingSoon: true,
          },
          {
            title: "Chaos Testing",
            href: ADMIN_ROUTES.KERNEL_LAB.CHAOS,
            icon: "Zap",
            isComingSoon: true,
          },
          {
            title: "Reports",
            href: ADMIN_ROUTES.KERNEL_LAB.REPORTS,
            icon: "BarChart3",
            isComingSoon: true,
          },
        ],
      },
    ],
  },
  {
    sectionTitle: "SYSTEM",
    items: [
      {
        title: "Kernel",
        href: ADMIN_ROUTES.KERNEL,
        icon: "Cpu",
        isComingSoon: true,
      },
      {
        title: "Analytics",
        href: ADMIN_ROUTES.ANALYTICS,
        icon: "Activity",
        isComingSoon: true,
      },
      {
        title: "Settings",
        href: ADMIN_ROUTES.SETTINGS,
        icon: "Sliders",
        isComingSoon: true,
      },
    ],
  },
];

export const SIMULATION_STATUS_ENUM = {
  PENDING: "pending",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export const ADMIN_METRICS_MOCK = {
  KERNEL_VERSION: "v2.4.0-deterministic",
  SIMULATION_RUNS_TOTAL: 128,
  SIMULATION_RUNS_ACTIVE: 0,
  SNAPSHOTS_RECORDED: 42,
  VALIDATION_STATUS: "PASS",
  DETERMINISM_SCORE: "100%",
  REGRESSION_SUITES: "14/14 Passed",
  ENVIRONMENT: "INTERNAL ENGINEERING LAB",
};
