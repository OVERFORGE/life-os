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
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ToolActivityItem, ConfirmationItem, MissingConnectionItem } from "./useChat";

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

  // Thinking State Pill
  if (!isUser && !displayContent && (!toolActivities || toolActivities.length === 0)) {
    return (
      <div className="flex w-full justify-start py-3">
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#1F2023] border border-[#2A2B2F] text-gray-300 text-xs shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#E8414A] animate-pulse" />
          <span className="font-medium text-gray-300">
            {statusPhase === "understanding" ? "Understanding your request…" : "Checking context…"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex flex-col group w-full ${
          isUser ? "items-end max-w-[60%]" : "items-start max-w-[85%]"
        }`}
      >
        {/* Tool Activity Cards (Part XI & Part XIV) */}
        {!isUser && toolActivities && toolActivities.length > 0 && (
          <div className="w-full space-y-2.5 mb-3">
            {toolActivities.map((act, idx) => {
              const isSpotify = act.providerId === "spotify" || act.capabilityURN.includes("playback") || act.capabilityURN.includes("spotify");
              const isPaused = act.details?.command === "pause" || act.details?.isPlaying === false || act.humanMessage.toLowerCase().includes("paused");
              const device = act.details?.deviceName;
              const spotifyId = act.details?.spotifyId;
              const itemType = act.details?.itemType === "playlist" ? "playlist" : act.details?.itemType === "artist" ? "artist" : "track";
              const spotifyUrl = act.details?.spotifyUrl;
              const nowPlaying = act.details?.nowPlaying;

              if (isSpotify) {
                return (
                  <div
                    key={`${act.id || act.providerId}_${idx}`}
                    className="w-full bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-3.5 shadow-sm space-y-3 transition-colors hover:border-[#3A3C42]"
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-[#26282E] text-gray-300 border border-[#3E424B] flex items-center justify-center shrink-0">
                          {renderToolIcon(act.iconName, "w-4 h-4 text-gray-300")}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-white">
                              {act.providerDisplayName}
                            </h4>
                            {device && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[#161618] text-gray-400 border border-[#2A2B2F] flex items-center gap-1">
                                <Speaker className="w-2.5 h-2.5 text-gray-400" />
                                {device}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[240px] sm:max-w-sm">
                            {act.humanMessage}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {act.state === "started" && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400">
                            <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                            <span className="text-[11px] font-medium">Connecting</span>
                          </div>
                        )}
                        {act.state === "completed" && (
                          <div
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              isPaused
                                ? "bg-[#161618] text-gray-400 border border-[#2A2B2F]"
                                : "bg-[#1F2023] text-[#ECE7E3] border border-[#2A2B2F]"
                            }`}
                          >
                            {isPaused ? <Pause className="w-2.5 h-2.5" /> : <Check className="w-3 h-3 text-[#E8414A]" />}
                            <span>{isPaused ? "Paused" : "Active"}</span>
                          </div>
                        )}
                        {act.state === "failed" && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 font-medium">
                            <AlertCircle className="w-2.5 h-2.5" />
                            <span>Failed</span>
                          </div>
                        )}
                        {spotifyUrl && (
                          <a
                            href={spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                            title="Open in Spotify"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Spotify Interactive Embed or Media Info Bar */}
                    {spotifyId ? (
                      <div className="w-full rounded-xl overflow-hidden border border-[#2A2B2F] bg-[#161618]">
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
                      <div className="w-full rounded-xl bg-[#18191B] border border-[#26272B] p-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-[#26282E] border border-[#3E424B] flex items-center justify-center shrink-0">
                            <Music className="w-3 h-3 text-gray-300" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate max-w-[280px]">
                              {nowPlaying}
                            </p>
                            {act.details?.artistName && (
                              <p className="text-[11px] text-gray-400 truncate">
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
                  className="w-full bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-4 shadow-sm flex items-center justify-between"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="p-2.5 rounded-xl border flex items-center justify-center shrink-0 bg-[#26282E] text-[#ECE7E3] border-[#3E424B]">
                      {renderToolIcon(act.iconName, "w-4 h-4")}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white tracking-wide">
                        {act.providerDisplayName}
                      </h4>
                      <p className="text-xs text-gray-300 font-medium mt-0.5 truncate max-w-[280px] sm:max-w-md">
                        {act.humanMessage}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 pl-3 shrink-0">
                    {act.state === "started" && !displayContent && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-300">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E8414A]" />
                        <span className="text-[11px] font-medium">Connecting</span>
                      </div>
                    )}
                    {((act.state === "completed") || (act.state === "started" && displayContent)) && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-[#ECE7E3] bg-[#1F2023] border border-[#2A2B2F]">
                        <Check className="w-3.5 h-3.5 text-[#E8414A]" />
                        <span className="text-[11px]">Active</span>
                      </div>
                    )}
                    {act.state === "failed" && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Unavailable</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Missing Connection Card (Part VI & Part XVII) */}
        {!isUser && missingConnection && (
          <div className="w-full bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-4 mb-3 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#26282E] text-gray-300 border border-[#3E424B]">
                {renderToolIcon(missingConnection.iconName)}
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">
                  {missingConnection.providerDisplayName}
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
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
              className="px-3.5 py-1.5 bg-[#E8414A]/10 hover:bg-[#E8414A]/20 border border-[#E8414A]/30 text-[#E8414A] rounded-xl text-xs font-bold tracking-wide transition-colors flex items-center gap-1.5"
            >
              <Plug size={12} />
              Connect {missingConnection.providerDisplayName}
            </button>
          </div>
        )}

        {/* Claude Desktop-Style Human-in-the-Loop (HITL) Permission Card */}
        {!isUser && confirmation && (
          <div className="w-full bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 mb-3 shadow-md space-y-3.5 transition-all">
            {/* Header Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#26282E] border border-[#3E424B] flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-4 h-4 text-[#E8414A]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E8414A]/10 text-[#E8414A] border border-[#E8414A]/20">
                      Permission Required
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-0.5">{confirmation.title}</h4>
                </div>
              </div>
            </div>

            {/* Description Message */}
            {confirmation.message && (
              <p className="text-xs text-gray-300 leading-relaxed font-normal">
                {confirmation.message}
              </p>
            )}

            {/* Structured Scope & Target Details */}
            {confirmation.details && Object.keys(confirmation.details).length > 0 && (
              <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3 space-y-1.5">
                {Object.entries(confirmation.details).map(([key, value]) => (
                  <div key={key} className="text-xs flex items-center justify-between gap-2">
                    <span className="text-gray-400 font-medium">{key}</span>
                    <span className="text-gray-200 font-mono text-[11px] bg-[#1F2023] px-2 py-0.5 rounded-md border border-[#2A2B2F] truncate max-w-[240px]">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons / Resolved State */}
            <div className="flex items-center gap-2 pt-0.5">
              {decision === "allowed" ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1F2023] border border-[#2A2B2F] text-xs font-semibold text-[#FFFDFC]">
                  <Check className="w-3.5 h-3.5 text-[#E8414A]" />
                  <span>Access Allowed</span>
                </div>
              ) : decision === "denied" ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Access Denied</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setDecision("allowed");
                      onConfirm?.(confirmation.actionId, true);
                    }}
                    className="px-4 py-2 bg-[#E8414A] hover:bg-[#d0353e] text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {confirmation.confirmLabel || "Allow"}
                  </button>
                  <button
                    onClick={() => {
                      setDecision("denied");
                      onConfirm?.(confirmation.actionId, false);
                    }}
                    className="px-4 py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] text-gray-300 hover:text-white rounded-xl text-xs font-semibold transition-all active:scale-95"
                  >
                    {confirmation.cancelLabel || "Deny"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Response Content */}
        {displayContent ? (
          <div
            className={`
            text-[15px]
            leading-relaxed
            whitespace-pre-wrap
            break-words
            w-full
            ${
              isUser
                ? "bg-[#1F2023] border border-[#2A2B2F] text-gray-100 rounded-2xl rounded-tr-sm px-5 py-4 shadow-sm"
                : "bg-transparent text-gray-200 py-1"
            }
            `}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="w-full my-3 overflow-x-auto rounded-xl border border-[#2A2B2F] bg-[#1F2023] shadow-sm">
                    <table className="w-full text-left text-xs border-collapse">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-[#26282E] border-b border-[#2A2B2F] text-[#FFFDFC] uppercase text-[10px] tracking-wider font-semibold">
                    {children}
                  </thead>
                ),
                tbody: ({ children }) => (
                  <tbody className="divide-y divide-[#2A2B2F]/60 text-gray-200">
                    {children}
                  </tbody>
                ),
                tr: ({ children }) => (
                  <tr className="hover:bg-white/[0.03] transition-colors">
                    {children}
                  </tr>
                ),
                th: ({ children }) => (
                  <th className="px-3.5 py-2.5 font-semibold text-[#FFFDFC]">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3.5 py-2.5 text-gray-200 align-middle">
                    {children}
                  </td>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="my-2.5 border-l-2 border-[#E8414A] bg-[#18191B] py-2 px-3.5 rounded-r-lg text-xs italic text-gray-300 leading-relaxed">
                    {children}
                  </blockquote>
                ),
                code: ({ inline, className, children, ...props }: any) => {
                  if (inline) {
                    return (
                      <code className="px-1.5 py-0.5 rounded bg-[#26282E] text-[#ECE7E3] font-mono text-[11px] border border-[#3E424B]">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <div className="my-2.5 rounded-xl bg-[#18191B] border border-[#2A2B2F] p-3 overflow-x-auto">
                      <code className="font-mono text-xs text-gray-200" {...props}>
                        {children}
                      </code>
                    </div>
                  );
                },
                hr: () => <hr className="my-3.5 border-t border-[#2A2B2F]" />,
                h3: ({ children }) => (
                  <h3 className="text-sm font-bold text-[#FFFDFC] mt-3.5 mb-2 flex items-center gap-1.5">
                    {children}
                  </h3>
                ),
                h4: ({ children }) => (
                  <h4 className="text-xs font-bold text-[#FFFDFC] uppercase tracking-wider mt-2.5 mb-1.5">
                    {children}
                  </h4>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc ml-5 space-y-1.5 my-2.5 text-gray-200 text-xs sm:text-[13px]">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal ml-5 space-y-1.5 my-2.5 text-gray-200 text-xs sm:text-[13px]">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="leading-relaxed">{children}</li>
                ),
                p: ({ children }) => (
                  <p className="mb-2.5 last:mb-0 leading-relaxed text-gray-200 text-xs sm:text-[13px]">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-[#FFFDFC]">{children}</strong>
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        ) : null}

        {/* Actions Row (Listen / Copy) */}
        {displayContent && (
          <div
            className={`mt-2 ${isUser ? "mr-2" : "ml-1"} flex items-center gap-2 ${
              isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            } transition-opacity duration-200`}
          >
            {!isUser && (
              <button
                onClick={handleToggleAudio}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isPlaying
                    ? "text-[#E8414A] bg-[#E8414A]/15 border border-[#E8414A]/30 shadow-sm"
                    : "text-[#9ca3af] hover:text-gray-300 hover:bg-white/5"
                }`}
                title={isPlaying ? "Stop listening" : "Listen to response"}
              >
                {isPlaying ? (
                  <>
                    <Square size={12} className="fill-current text-[#E8414A] animate-pulse" />
                    <span className="text-[#E8414A] font-semibold">Stop</span>
                  </>
                ) : (
                  <>
                    <Volume2 size={14} />
                    <span>Listen</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[#9ca3af] hover:text-gray-300 hover:bg-white/5 transition-colors text-xs font-medium"
            >
              {copied ? <Check size={14} className="text-[#E8414A]" /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}