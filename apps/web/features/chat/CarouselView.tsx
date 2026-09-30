"use client";

import React from "react";
import { ExternalLink, Star, Clock, Zap, ShoppingCart, Utensils, Car } from "lucide-react";

export interface CarouselCardItem {
  id?: string;
  type?: "product" | "restaurant" | "ride";
  title: string;
  subtitle?: string;
  price?: string;
  originalPrice?: string;
  badge?: string;
  platform: string;
  platformColor?: string;
  imageUrl?: string;
  actionUrl: string;
  actionLabel?: string;
}

interface CarouselViewProps {
  items: CarouselCardItem[];
  onOpenLink: (url: string) => void;
}

export default function CarouselView({ items, onOpenLink }: CarouselViewProps) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const getPlatformIcon = (type?: string, platform?: string) => {
    const p = (platform || "").toLowerCase();
    if (type === "ride" || p.includes("uber") || p.includes("ola") || p.includes("rapido")) {
      return <Car className="w-3.5 h-3.5 text-yellow-400" />;
    }
    if (type === "restaurant" || p.includes("zomato") || p.includes("swiggy")) {
      return <Utensils className="w-3.5 h-3.5 text-[#E8414A]" />;
    }
    if (p.includes("zepto") || p.includes("blinkit") || p.includes("instamart")) {
      return <Zap className="w-3.5 h-3.5 text-[#E8414A]" />;
    }
    return <ShoppingCart className="w-3.5 h-3.5 text-blue-400" />;
  };

  const getPlatformBadgeColor = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes("zepto")) return "bg-purple-950/60 text-purple-300 border-purple-800/40";
    if (p.includes("blinkit")) return "bg-amber-950/60 text-amber-300 border-amber-800/40";
    if (p.includes("zomato")) return "bg-rose-950/60 text-rose-300 border-rose-800/40";
    if (p.includes("swiggy")) return "bg-orange-950/60 text-orange-300 border-orange-800/40";
    if (p.includes("uber")) return "bg-neutral-900 text-neutral-200 border-neutral-700";
    if (p.includes("ola")) return "bg-lime-950/60 text-lime-300 border-lime-800/40";
    if (p.includes("rapido")) return "bg-yellow-950/60 text-yellow-300 border-yellow-800/40";
    if (p.includes("amazon")) return "bg-sky-950/60 text-sky-300 border-sky-800/40";
    return "bg-[#26282E] text-gray-300 border-[#3E424B]";
  };

  return (
    <div className="w-full my-3">
      <div className="flex gap-3 overflow-x-auto pb-2.5 pt-1 px-0.5 no-scrollbar scroll-smooth">
        {items.map((card, idx) => {
          const badgeClass = getPlatformBadgeColor(card.platform);

          return (
            <div
              key={card.id || `${card.title}_${idx}`}
              className="w-[210px] sm:w-[225px] shrink-0 bg-[#1F2023] border border-[#2A2B2F] hover:border-[#E8414A]/40 rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-200 shadow-md group"
            >
              {/* Card Media Header */}
              <div className="relative w-full h-[120px] bg-[#161618] overflow-hidden flex items-center justify-center">
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback if image fails
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#26282E] border border-[#3E424B] flex items-center justify-center text-gray-400">
                    {getPlatformIcon(card.type, card.platform)}
                  </div>
                )}

                {/* Floating Platform Badge */}
                <div
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded-md border text-[10px] font-bold tracking-wide flex items-center gap-1 backdrop-blur-md ${badgeClass}`}
                >
                  {getPlatformIcon(card.type, card.platform)}
                  <span>{card.platform}</span>
                </div>

                {/* Optional ETA or Rating Badge */}
                {card.badge && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-[#161618]/90 border border-white/10 text-[10px] font-semibold text-[#FFFDFC] flex items-center gap-1 backdrop-blur-md">
                    {card.badge.includes("★") ? (
                      <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                    ) : (
                      <Clock className="w-2.5 h-2.5 text-[#E8414A]" />
                    )}
                    <span>{card.badge.replace("★", "").trim()}</span>
                  </div>
                )}
              </div>

              {/* Card Body Details */}
              <div className="p-3 flex-1 flex flex-col justify-between">
                <div>
                  <h4
                    className="text-xs font-bold text-[#FFFDFC] line-clamp-2 leading-snug group-hover:text-white transition-colors"
                    title={card.title}
                  >
                    {card.title}
                  </h4>
                  {card.subtitle && (
                    <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">
                      {card.subtitle}
                    </p>
                  )}
                </div>

                {/* Price and CTA */}
                <div className="mt-3 pt-2.5 border-t border-[#2A2B2F]/60 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    {card.price && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-extrabold text-[#FFFDFC]">
                          {card.price}
                        </span>
                        {card.originalPrice && (
                          <span className="text-[10px] text-gray-500 line-through">
                            {card.originalPrice}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => onOpenLink(card.actionUrl)}
                    className="px-2.5 py-1.5 bg-[#26282E] hover:bg-[#E8414A] border border-[#3E424B] hover:border-transparent text-[#ECE7E3] hover:text-white rounded-xl text-[11px] font-bold tracking-wide transition-all duration-150 active:scale-95 flex items-center gap-1 shrink-0"
                  >
                    <span>{card.actionLabel || "View"}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-80" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
