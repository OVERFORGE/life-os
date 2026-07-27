"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User as UserIcon, ChevronRight, Settings, MapPin, Power, Activity, Laptop } from "lucide-react";

export default function SettingsDashboard() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user")
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setUserProfile(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    if (confirm("Are you sure you want to sign out?")) {
      window.location.href = "/api/auth/signout"; // Default NextAuth signout route
    }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-3xl mx-auto w-full">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-100">System Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Manage personalization, algorithms, and active zones.</p>
        </div>
        
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-bold tracking-wider text-red-500 hover:bg-red-500/20 transition-colors uppercase"
        >
          <Power size={14} /> Logout
        </button>
      </div>

      <div className="flex-1 pb-20 space-y-8">
        
        {/* User Profile Card */}
        {loading ? (
          <div className="h-28 bg-[#1F2023] border border-[#2A2B2F] rounded-3xl animate-pulse" />
        ) : userProfile && (
          <div 
            onClick={() => router.push('/profile')}
            className="group flex items-center bg-[#1F2023] border border-[#2A2B2F] hover:border-gray-500/30 rounded-3xl p-5 cursor-pointer transition-all shadow-sm"
          >
            <div className="w-16 h-16 rounded-full bg-[#2A2B2F] border border-[#3A3C42] flex items-center justify-center overflow-hidden mr-5 shrink-0">
              {userProfile.image ? (
                <img src={userProfile.image} alt={userProfile.name} className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={28} className="text-gray-400" />
              )}
            </div>
            
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-100 mb-0.5">{userProfile.name || "User Profile"}</h2>
              <p className="text-sm font-semibold text-gray-400">{userProfile.email}</p>
            </div>
            
            <div className="w-10 h-10 rounded-full bg-[#2A2B2F] group-hover:bg-[#3A3C42] flex items-center justify-center transition-colors">
              <ChevronRight size={20} className="text-gray-400 group-hover:text-white" />
            </div>
          </div>
        )}

        {/* Preferences Section */}
        <div>
          <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-3 ml-2">Preferences</div>
          
          <div className="space-y-3">
            <RoutingCard
              title="Personalization"
              description="Reminders, rollover hour & diet preferences"
              icon={<Settings size={22} className="text-gray-300" />}
              iconBg="bg-[#2A2B2F]"
              onClick={() => router.push('/settings/personalization')}
            />
            
            <RoutingCard
              title="Locations"
              description="Voice assistant zones & geofencing"
              icon={<MapPin size={22} className="text-[#E8414A]" />}
              iconBg="bg-[#E8414A]/15"
              onClick={() => router.push('/settings/locations')}
            />
            
            <RoutingCard
              title="Custom Signals"
              description="Create & manage category schemas"
              icon={<Activity size={22} className="text-gray-300" />}
              iconBg="bg-[#2A2B2F]"
              onClick={() => router.push('/settings/signals')}
            />
            
            <RoutingCard
              title="Algorithm Weights"
              description="Tune LifeOS V1 Phase & Goal weights"
              icon={<Settings size={22} className="text-gray-300" />}
              iconBg="bg-[#2A2B2F]"
              onClick={() => router.push('/settings/weights')}
            />

            <RoutingCard
              title="Devices"
              description="Manage active sessions & remote logout"
              icon={<Laptop size={22} className="text-[#E8414A]" />}
              iconBg="bg-[#E8414A]/15"
              onClick={() => router.push('/settings/devices')}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

function RoutingCard({ 
  title, 
  description, 
  icon, 
  iconBg, 
  onClick 
}: { 
  title: string; 
  description: string; 
  icon: React.ReactNode; 
  iconBg: string;
  onClick: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      className="group flex items-center bg-[#1F2023] border border-[#2A2B2F] hover:border-gray-500/30 rounded-3xl p-5 cursor-pointer transition-all shadow-sm"
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mr-5 shrink-0 ${iconBg}`}>
        {icon}
      </div>
      
      <div className="flex-1">
        <h3 className="text-base font-bold text-gray-100 mb-1">{title}</h3>
        <p className="text-sm font-semibold text-gray-400">{description}</p>
      </div>
      
      <div className="w-9 h-9 rounded-full bg-[#2A2B2F] group-hover:bg-[#3A3C42] flex items-center justify-center transition-colors">
        <ChevronRight size={18} className="text-gray-400 group-hover:text-white" />
      </div>
    </div>
  );
}
