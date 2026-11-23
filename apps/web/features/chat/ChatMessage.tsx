"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy,
  Check,
  Volume2,
  Square,
  Calendar,
  Music,
  FolderGit2,
  Mail,
  HardDrive,
  Globe,
  Plug,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Speaker,
  Pause,
  Activity,
  Flame,
  Footprints,
  Users,
  FileText,
  Cloud,
  MailOpen,
  Sparkles,
} from "lucide-react";
import { ToolActivityItem, ConfirmationItem, MissingConnectionItem } from "./useChat";
import CarouselView from "./CarouselView";

type Props = {
  role: "user" | "assistant";
  content: string;
  statusPhase?: string;
  toolActivities?: ToolActivityItem[];
  confirmation?: ConfirmationItem;
  missingConnection?: MissingConnectionItem;
  onConfirm?: (actionId: string, confirmed: boolean) => void;
  onConnect?: (providerId: string) => void;
};

export default function ChatMessage({
  role,
  content,
  statusPhase,
  toolActivities,
  confirmation,
  missingConnection,
  onConfirm,
  onConnect,
}: Props) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [decision, setDecision] = useState<"allowed" | "denied" | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up <think> tags from model reasoning
  const displayContent = content.replace(/<think>[\s\S]*?<\/think>\n?/g, "").trim();

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current = null;
      }
    };
  }, []);

  const handleToggleAudio = () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    if (!displayContent) return;

    try {
      const audio = new Audio(
        `/api/voice/tts?text=${encodeURIComponent(displayContent)}&voice=en-GB-RyanNeural`
      );
      audioRef.current = audio;
      setIsPlaying(true);

      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };

      audio.play().catch((err) => {
        console.warn("[CHAT_MESSAGE] Playback error:", err);
        setIsPlaying(false);
        audioRef.current = null;
      });
    } catch (err) {
      console.warn("[CHAT_MESSAGE] Audio error:", err);
      setIsPlaying(false);
    }
  };

  const handleCopy = () => {
    if (!displayContent) return;
    navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExternalLinkClick = async (
    e?: React.MouseEvent<HTMLAnchorElement>,
    href?: string
  ) => {
    if (!href) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const { openExternalUrl } = await import("@/lib/desktopBridge");
    await openExternalUrl(href);
  };

  const renderToolIcon = (iconName: string, className = "w-4 h-4") => {
    switch (iconName) {
      case "Calendar":
      case "CalendarPlus":
      case "CalendarX":
        return <Calendar className={className} />;
      case "Music":
      case "Headphones":
        return <Music className={className} />;
      case "FolderGit2":
      case "GitPullRequest":
      case "Code2":
        return <FolderGit2 className={className} />;
      case "Mail":
      case "MailSearch":
        return <Mail className={className} />;
      case "MailOpen":
        return <MailOpen className={className} />;
      case "FileText":
      case "FileCheck":
        return <FileText className={className} />;
      case "Cloud":
        return <Cloud className={className} />;
      case "HardDrive":
        return <HardDrive className={className} />;
      case "Globe":
        return <Globe className={className} />;
      case "Activity":
      case "Heart":
        return <Activity className={className} />;
      case "Flame":
        return <Flame className={className} />;
      case "Footprints":
        return <Footprints className={className} />;
      case "Users":
      case "UserCheck":
        return <Users className={className} />;
      default:
        return <Plug className={className} />;
    }
  };

  // Thinking State Pill (Calm glowing Torus / Amber pulse)
  if (!isUser && !displayContent && (!toolActivities || toolActivities.length === 0)) {
    return (
      <div className="flex w-full justify-start py-3 animate-in fade-in duration-200">
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[#1b1b1d] border border-[#26262a] text-[#C5C2BA] text-xs shadow-sm">
          <div className="relative w-3.5 h-3.5 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-[#ffb86c]/30 animate-ping" />
            <span className="relative w-2 h-2 rounded-full bg-[#ffb86c]" />
          </div>
          <span className="font-mono text-[11px] text-[#F7F5F0]">
            {statusPhase === "understanding" ? "Understanding your request…" : "Checking execution context…"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} animate-in fade-in duration-200`}>
      <div
        className={`flex flex-col group w-full ${
          isUser ? "items-end max-w-xl" : "items-start max-w-2xl"
        }`}
      >
        {/* Tool Activity Cards */}
        {!isUser && toolActivities && toolActivities.length > 0 && (
          <div className="w-full space-y-2 mb-3">
            {toolActivities.map((act, idx) => {
              const isSpotify =
                act.providerId === "spotify" ||
                act.capabilityURN.includes("playback") ||
                act.capabilityURN.includes("spotify");
              const isPaused =
                act.details?.command === "pause" ||
                act.details?.isPlaying === false ||
                act.humanMessage.toLowerCase().includes("paused");
              const device = act.details?.deviceName;
              const spotifyId = act.details?.spotifyId;
              const itemType =
                act.details?.itemType === "playlist"
                  ? "playlist"
                  : act.details?.itemType === "artist"
                  ? "artist"
                  : "track";
              const spotifyUrl = act.details?.spotifyUrl;
              const nowPlaying = act.details?.nowPlaying;

              if (isSpotify) {
                return (
                  <div
                    key={`${act.id || act.providerId}_${idx}`}
                    className="w-full bg-[#1b1b1d] border border-[#26262a] rounded-2xl p-3.5 shadow-sm space-y-3 transition-colors hover:border-[#ffb86c]/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-[#111113] text-[#ffb86c] border border-[#23242A] flex items-center justify-center shrink-0">
                          {renderToolIcon(act.iconName, "w-4 h-4 text-[#ffb86c]")}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-[#F7F5F0]">
                              {act.providerDisplayName}
                            </h4>
                            {device && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[#111113] text-[#85827A] border border-[#23242A] flex items-center gap-1">
                                <Speaker className="w-2.5 h-2.5 text-[#ffb86c]" />
                                {device}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#C5C2BA] mt-0.5 truncate max-w-[240px] sm:max-w-sm">
                            {act.humanMessage}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {act.state === "started" && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ffb86c]/10 border border-[#ffb86c]/20 text-xs text-[#ffb86c]">
                            <Loader2 className="w-3 h-3 animate-spin text-[#ffb86c]" />
                            <span className="text-[10px] font-mono">Connecting</span>
                          </div>
                        )}
                        {act.state === "completed" && (
                          <div
                            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                              isPaused
                                ? "bg-[#111113] text-[#85827A] border border-[#23242A]"
                                : "bg-[#ffb86c]/15 text-[#ffb86c] border border-[#ffb86c]/30"
                            }`}
                          >
                            {isPaused ? <Pause className="w-2.5 h-2.5" /> : <Check className="w-3 h-3 text-[#ffb86c]" />}
                            <span>{isPaused ? "Paused" : "Active"}</span>
                          </div>
                        )}
                        {act.state === "failed" && (
                          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-[10px] font-mono text-rose-400 font-medium">
                            <AlertCircle className="w-2.5 h-2.5" />
                            <span>Failed</span>
                          </div>
                        )}
                        {spotifyUrl && (
                          <a
                            href={spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-[#85827A] hover:text-[#F7F5F0] rounded-lg hover:bg-[#23242A] transition-colors"
                            title="Open in Spotify"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {spotifyId ? (
                      <div className="w-full rounded-xl overflow-hidden border border-[#23242A] bg-[#111113]">
                        <iframe
                          src={`https://open.spotify.com/embed/${itemType}/${spotifyId}?utm_source=generator&theme=0`}
                          width="100%"
                          height={itemType === "track" ? "80" : "152"}
                          frameBorder="0"
                          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                          loading="lazy"
                          className="w-full block"
                        />
                      </div>
                    ) : nowPlaying ? (
                      <div className="w-full rounded-xl bg-[#111113] border border-[#23242A] p-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-[#17171A] border border-[#23242A] flex items-center justify-center shrink-0">
                            <Music className="w-3 h-3 text-[#ffb86c]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#F7F5F0] truncate max-w-[280px]">
                              {nowPlaying}
                            </p>
                            {act.details?.artistName && (
                              <p className="text-[11px] text-[#85827A] truncate font-mono">
                                {act.details.artistName}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <div
                  key={`${act.id || act.providerId}_${idx}`}
                  className="w-full bg-[#1b1b1d] border border-[#26262a] rounded-2xl p-3.5 shadow-sm flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl border flex items-center justify-center shrink-0 bg-[#111113] text-[#ffb86c] border-[#23242A]">
                      {renderToolIcon(act.iconName, "w-4 h-4")}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-[#F7F5F0] tracking-wide">
                        {act.providerDisplayName}
                      </h4>
                      <p className="text-xs text-[#C5C2BA] mt-0.5 truncate max-w-[280px] sm:max-w-md">
                        {act.humanMessage}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {act.state === "started" && !displayContent && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ffb86c]/10 border border-[#ffb86c]/20 text-xs text-[#ffb86c]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#ffb86c]" />
                        <span className="text-[10px] font-mono">Active</span>
                      </div>
                    )}
                    {((act.state === "completed") || (act.state === "started" && displayContent)) && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-[#ffb86c] bg-[#ffb86c]/15 border border-[#ffb86c]/30">
                        <Check className="w-3.5 h-3.5 text-[#ffb86c]" />
                        <span className="text-[10px] font-mono">Executed</span>
                      </div>
                    )}
                    {act.state === "failed" && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono">Failed</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Missing Connection Card */}
        {!isUser && missingConnection && (
          <div className="w-full bg-[#1b1b1d] border border-[#26262a] rounded-2xl p-4 mb-3 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#111113] text-[#ffb86c] border border-[#23242A]">
                {renderToolIcon(missingConnection.iconName)}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-[#F7F5F0]">
                  {missingConnection.providerDisplayName}
                </h4>
                <p className="text-xs text-[#85827A] mt-0.5">
                  {missingConnection.message}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                if (onConnect) {
                  onConnect(missingConnection.providerId);
                } else {
                  window.location.href = missingConnection.connectUrl || "/settings/connections";
                }
              }}
              className="px-3.5 py-1.5 bg-[#ffb86c]/15 hover:bg-[#ffb86c]/25 border border-[#ffb86c]/40 text-[#ffb86c] rounded-xl text-xs font-bold tracking-wide transition cursor-pointer flex items-center gap-1.5"
            >
              <Plug size={12} />
              Connect {missingConnection.providerDisplayName}
            </button>
          </div>
        )}

        {/* HITL Permission Card / Proposed Change (Image 1 & Stitch Format) */}
        {!isUser && confirmation && (
          <div className="w-full bg-[#1b1b1d] border border-[#26262a] rounded-xl p-4 my-2 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
                {confirmation.title || "Proposed Change"}
              </span>
              <span className="text-sm font-medium text-[#F7F5F0] truncate">
                {confirmation.message}
              </span>
              {confirmation.details && Object.keys(confirmation.details).length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {Object.entries(confirmation.details).map(([k, v]) => (
                    <span
                      key={k}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#111113] border border-[#23242A] text-[#ffb86c]"
                    >
                      {k}: {v}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {decision === "allowed" ? (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#ffb86c]/15 border border-[#ffb86c]/30 text-xs font-mono text-[#ffb86c]">
                  <Check className="w-3.5 h-3.5 text-[#ffb86c]" />
                  <span>Confirmed</span>
                </div>
              ) : decision === "denied" ? (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Declined</span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDecision("denied");
                      onConfirm?.(confirmation.actionId, false);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-[#26262a] hover:bg-[#353437] text-xs font-medium text-[#C5C2BA] hover:text-[#F7F5F0] transition cursor-pointer"
                  >
                    {confirmation.cancelLabel || "Adjust"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDecision("allowed");
                      onConfirm?.(confirmation.actionId, true);
                    }}
                    className="px-4 py-1.5 rounded-lg bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#1A0F00] text-xs font-semibold shadow-md transition active:scale-95 cursor-pointer"
                  >
                    {confirmation.confirmLabel || "Confirm"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Response Content */}
        {displayContent ? (
          isUser ? (
            /* User Message Bubble */
            <div className="px-4 py-3 rounded-2xl bg-[#1b1b1d] border border-[#26262a] text-[14px] leading-relaxed text-[#F7F5F0] shadow-sm">
              {displayContent}
            </div>
          ) : (
            /* Assistant Direct Markdown Stream (Stitch Canvas Style) */
            <div className="text-[14px] sm:text-[15px] leading-relaxed text-[#e5e1e4] w-full py-1">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="w-full my-3 overflow-x-auto rounded-xl border border-[#23242A] bg-[#17171A] shadow-sm custom-h-scrollbar">
                      <table className="w-full text-left text-xs border-collapse font-sans">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-[#111113] border-b border-[#23242A] text-[#ffb86c] uppercase text-[10px] tracking-wider font-mono">
                      {children}
                    </thead>
                  ),
                  tbody: ({ children }) => (
                    <tbody className="divide-y divide-[#23242A] text-[#C5C2BA]">
                      {children}
                    </tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className="hover:bg-white/[0.02] transition-colors">
                      {children}
                    </tr>
                  ),
                  th: ({ children }) => (
                    <th className="px-3.5 py-2.5 font-semibold font-mono text-[#ffb86c]">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3.5 py-2.5 text-[#C5C2BA] align-middle font-mono text-xs">
                      {children}
                    </td>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="my-2.5 border-l-2 border-[#ffb86c] bg-[#17171A] py-2 px-3.5 rounded-r-lg text-xs italic text-[#C5C2BA] leading-relaxed">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      onClick={(e) => handleExternalLinkClick(e, href)}
                      className="text-[#ffb86c] hover:underline font-medium cursor-pointer inline-flex items-center gap-1 mx-0.5"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>{children}</span>
                      <ExternalLink className="w-3 h-3 inline shrink-0 opacity-70" />
                    </a>
                  ),
                  code: ({ inline, className, children, ...props }: any) => {
                    const matchCarousel =
                      className === "language-lifeos-carousel" ||
                      className === "language-carousel";
                    if (matchCarousel && typeof children === "string") {
                      try {
                        const parsed = JSON.parse(children.trim());
                        if (Array.isArray(parsed) && parsed.length > 0) {
                          return (
                            <CarouselView
                              items={parsed}
                              onOpenLink={(url) => handleExternalLinkClick(undefined, url)}
                            />
                          );
                        }
                      } catch (_) {}
                    }

                    if (inline) {
                      return (
                        <code className="px-1.5 py-0.5 rounded bg-[#111113] text-[#ffb86c] font-mono text-[11px] border border-[#23242A]">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <div className="my-2.5 rounded-xl bg-[#111113] border border-[#23242A] p-3.5 overflow-x-auto custom-h-scrollbar">
                        <code className="font-mono text-xs text-[#F7F5F0]" {...props}>
                          {children}
                        </code>
                      </div>
                    );
                  },
                  hr: () => <hr className="my-3.5 border-t border-[#23242A]" />,
                  h1: ({ children }) => (
                    <h1 className="text-base font-bold text-[#F7F5F0] mt-4 mb-2">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-sm font-bold text-[#F7F5F0] mt-3.5 mb-1.5">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-xs font-bold text-[#ffb86c] uppercase tracking-wider font-mono mt-3 mb-1.5">
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-[11px] font-bold text-[#85827A] uppercase tracking-wider font-mono mt-2.5 mb-1">
                      {children}
                    </h4>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc ml-5 space-y-1.5 my-2.5 text-[#C5C2BA] text-xs sm:text-[13px]">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal ml-5 space-y-1.5 my-2.5 text-[#C5C2BA] text-xs sm:text-[13px]">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed">{children}</li>
                  ),
                  p: ({ children }) => (
                    <p className="mb-2.5 last:mb-0 leading-relaxed text-[#e5e1e4] text-xs sm:text-[14px]">
                      {children}
                    </p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[#F7F5F0]">{children}</strong>
                  ),
                }}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          )
        ) : null}

        {/* Actions Row (Listen / Copy) */}
        {displayContent && (
          <div
            className={`mt-1.5 ${isUser ? "mr-1" : "ml-0.5"} flex items-center gap-2 ${
              isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            } transition-opacity duration-200`}
          >
            {!isUser && (
              <button
                type="button"
                onClick={handleToggleAudio}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  isPlaying
                    ? "text-[#ffb86c] bg-[#ffb86c]/15 border border-[#ffb86c]/30 shadow-sm"
                    : "text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#1E1F24]"
                }`}
                title={isPlaying ? "Stop listening" : "Listen to response"}
              >
                {isPlaying ? (
                  <>
                    <Square size={11} className="fill-current text-[#ffb86c] animate-pulse" />
                    <span className="text-[#ffb86c] font-semibold text-[11px]">Stop</span>
                  </>
                ) : (
                  <>
                    <Volume2 size={13} />
                    <span className="text-[11px]">Listen</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#1E1F24] transition-colors text-[11px] font-mono cursor-pointer"
            >
              {copied ? <Check size={13} className="text-[#ffb86c]" /> : <Copy size={13} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
