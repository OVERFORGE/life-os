"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Power,
  ChevronRight,
  User as UserIcon,
  Sparkles,
  MapPin,
  Radio,
  Laptop,
  Scale,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";

interface UserProfile {
  name?: string;
  email?: string;
  role?: string;
  avatar?: string;
  createdAt?: string;
}

export default function SettingsDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUser(data);
      })
      .catch((err) => console.error("Failed to load user profile:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    if (confirm("Are you sure you want to sign out?")) {
      window.location.href = "/api/auth/signout";
    }
  };

  const navItems = [
    {
      title: "Personalization & Voice",
      desc: "Aven voice identity, name pronunciation, daily rollover & reminders",
      icon: Sparkles,
      iconBg: "bg-[#26282E] text-[#ECE7E3] border border-[#3E424B] group-hover:text-[#E8414A] group-hover:border-[#E8414A]/40",
      route: "/settings/personalization",
    },
    {
      title: "Locations & Zones",
      desc: "Voice assistant geofencing, home/work zones & triggers",
      icon: MapPin,
      iconBg: "bg-[#26282E] text-[#ECE7E3] border border-[#3E424B] group-hover:text-[#E8414A] group-hover:border-[#E8414A]/40",
      route: "/settings/locations",
    },
    {
      title: "Signals & Automations",
      desc: "External signals, context inputs & proactive behaviors",
      icon: Radio,
      iconBg: "bg-[#26282E] text-[#ECE7E3] border border-[#3E424B] group-hover:text-[#E8414A] group-hover:border-[#E8414A]/40",
      route: "/settings/signals",
    },
    {
      title: "Connected Devices",
      desc: "Desktop, mobile app sync & active session management",
      icon: Laptop,
      iconBg: "bg-[#26282E] text-[#ECE7E3] border border-[#3E424B] group-hover:text-[#E8414A] group-hover:border-[#E8414A]/40",
      route: "/settings/devices",
    },
    {
      title: "Weight & Health Hub",
      desc: "Scale calibrations, maintenance calorie baselines & trend preferences",
      icon: Scale,
      iconBg: "bg-[#26282E] text-[#ECE7E3] border border-[#3E424B] group-hover:text-[#E8414A] group-hover:border-[#E8414A]/40",
      route: "/settings/weights",
    },
  ];

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-3xl mx-auto w-full pt-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-100">Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Manage your account profile, voice assistant, and application preferences.</p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3.5 py-2 bg-[#E8414A]/10 border border-[#E8414A]/25 rounded-xl text-xs font-bold tracking-wider text-[#E8414A] hover:bg-[#E8414A]/20 transition-colors uppercase"
        >
          <Power size={14} /> Logout
        </button>
      </div>

      <div className="flex-1 pb-20 space-y-6">
        {/* User Profile Card */}
        <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E8414A] to-[#80181E] flex items-center justify-center text-white font-extrabold text-2xl shadow-lg">
              {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{user?.name || (loading ? "Loading..." : "User")}</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#2A2B2F] text-gray-300 border border-[#3E424B] rounded-full">
                  {user?.role || "Active Member"}
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-0.5">{user?.email || "Synced with LifeOS Account"}</p>
              {user?.createdAt && (
                <p className="text-xs text-gray-500 mt-1">
                  Member since {new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </p>
              )}
            </div>
          </div>
          <div className="p-2.5 bg-[#25262A] border border-[#303136] rounded-xl text-gray-300">
            <ShieldCheck className="w-5 h-5 text-gray-300" />
          </div>
        </div>

        {/* Section Header */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 ml-1">
            Preferences & Subsystems
          </h2>
          <div className="space-y-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  onClick={() => router.push(item.route)}
                  className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#383A40] rounded-2xl p-5 cursor-pointer transition-all flex items-center justify-between group shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${item.iconBg}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-[#E8414A] transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
