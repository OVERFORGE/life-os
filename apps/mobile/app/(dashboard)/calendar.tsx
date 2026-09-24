import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import {
  Calendar as CalendarIcon,
  Clock,
  Lock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Mic,
  Plus,
  ListTodo,
  X,
  RotateCw,
  Check,
  Flame,
  ArrowRight,
  CalendarDays,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../utils/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HOUR_HEIGHT = 60; // Spacious 60px per hour in Day view (24 * 60 = 1440px)

interface TimelineBlock {
  blockId: string;
  occurrenceId?: string;
  chronicleId?: string;
  title: string;
  kind: string;
  planned?: {
    startMinute: number;
    endMinute: number;
    durationMinutes: number;
  };
  actual?: {
    durationMinutes: number;
  };
  variance: {
    status: string;
    explanation: string;
  };
}

interface UnscheduledTask {
  id: string;
  title: string;
  priority?: string;
  estimatedDurationMinutes?: number;
  goalTitle?: string;
}

interface TimelineProjection {
  dateOnly: string;
  timezone: string;
  blocks: TimelineBlock[];
  summary: {
    totalPlannedMinutes: number;
    totalActualMinutes: number;
    completedOccurrencesCount: number;
  };
  tasksToSchedule?: UnscheduledTask[];
}

interface FloatingState {
  block: TimelineBlock;
  sourceDate: string;
  targetDate: string;
  targetHour: number;
  targetMinute: number;
  durationMinutes: number;
}

function formatMinutes(min: number): string {
  const norm = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatHourLabel(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

export default function CalendarScreen() {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'agenda'>('week');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [weekProjections, setWeekProjections] = useState<Record<string, TimelineProjection>>({});
  const [loading, setLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  // Floating card / Hard-select drag state (Google Calendar & Notion Calendar style)
  const [floatingState, setFloatingState] = useState<FloatingState | null>(null);
  const [hardSelectBlockId, setHardSelectBlockId] = useState<string | null>(null);

  // Modals state
  const [selectedBlock, setSelectedBlock] = useState<TimelineBlock | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [logTimeModalOpen, setLogTimeModalOpen] = useState(false);

  // Scheduling form state
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(() => selectedDate);
  const [scheduleHour, setScheduleHour] = useState(9); // Default 9 AM
  const [scheduleDuration, setScheduleDuration] = useState(60);

  // Log time form state
  const [logTaskTitle, setLogTaskTitle] = useState('');
  const [logMinutes, setLogMinutes] = useState('45');

  // Day View Scroll Ref
  const dayScrollRef = useRef<ScrollView>(null);

  // Compute 7 days of the current week (Mon-Sun)
  const weekDays = useMemo(() => {
    const cur = new Date(`${selectedDate}T12:00:00Z`);
    const dayOfWeek = (cur.getUTCDay() + 6) % 7; // Monday = 0
    const monday = new Date(cur);
    monday.setUTCDate(cur.getUTCDate() - dayOfWeek);

    const days = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        name: dayNames[i],
        dayNum: d.getUTCDate(),
        dateStr,
        isToday: dateStr === new Date().toISOString().split('T')[0],
        isSelected: dateStr === selectedDate,
      });
    }
    return days;
  }, [selectedDate]);

  // Current minute of the day for the red indicator
  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentMinute(now.getHours() * 60 + now.getMinutes());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch full week projections in parallel
  const loadWeekTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const days = weekDays.map((d) => d.dateStr);

      const results = await Promise.all(
        days.map(async (dateStr) => {
          try {
            const res = await fetchWithAuth(`/calendar/timeline?date=${dateStr}&timezone=${encodeURIComponent(tz)}`);
            if (res.ok) {
              const json = await res.json();
              if (json.ok || json.success) {
                return { dateStr, projection: json.data as TimelineProjection };
              }
            }
          } catch (e) {
            console.warn(`Failed to load timeline for ${dateStr}:`, e);
          }
          return { dateStr, projection: null };
        })
      );

      const mapping: Record<string, TimelineProjection> = {};
      results.forEach((item) => {
        if (item.projection) {
          mapping[item.dateStr] = item.projection;
        }
      });
      setWeekProjections(mapping);
    } catch (e) {
      console.error('Failed to load mobile week timeline:', e);
    } finally {
      setLoading(false);
    }
  }, [weekDays]);

  useEffect(() => {
    loadWeekTimeline();
  }, [loadWeekTimeline]);

  // Active projection for selected date
  const projection = weekProjections[selectedDate] || null;

  // Unscheduled tasks across loaded projections
  const tasksToSchedule = useMemo(() => {
    if (projection?.tasksToSchedule && projection.tasksToSchedule.length > 0) {
      return projection.tasksToSchedule;
    }
    for (const p of Object.values(weekProjections)) {
      if (p.tasksToSchedule && p.tasksToSchedule.length > 0) {
        return p.tasksToSchedule;
      }
    }
    return [];
  }, [projection, weekProjections]);

  // Total weekly summary stats
  const weekSummary = useMemo(() => {
    let planned = 0;
    let actual = 0;
    let completed = 0;
    Object.values(weekProjections).forEach((p) => {
      planned += p.summary?.totalPlannedMinutes || 0;
      actual += p.summary?.totalActualMinutes || 0;
      completed += p.summary?.completedOccurrencesCount || 0;
    });
    return { planned, actual, completed };
  }, [weekProjections]);

  // Auto-scroll Day view to current hour (or 8 AM)
  useEffect(() => {
    if (viewMode === 'day' && dayScrollRef.current) {
      const nowH = new Date().getHours();
      const targetHour = Math.max(0, nowH - 1);
      setTimeout(() => {
        dayScrollRef.current?.scrollTo({ y: targetHour * HOUR_HEIGHT, animated: true });
      }, 100);
    }
  }, [viewMode, selectedDate]);

  // Date Navigation handlers
  const handlePrev = () => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (viewMode === 'week' ? 7 : 1));
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNext = () => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (viewMode === 'week' ? 7 : 1));
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  // Schedule task mutation
  const handleConfirmSchedule = async () => {
    if (!scheduleTitle.trim() && !scheduleTaskId) {
      Alert.alert('Required', 'Please enter a task title');
      return;
    }
    setIsMutating(true);
    try {
      const startMin = scheduleHour * 60;
      const res = await fetchWithAuth('/calendar/mutate', {
        method: 'POST',
        body: JSON.stringify({
          action: 'schedule_task',
          taskId: scheduleTaskId || `custom-${Date.now()}`,
          taskTitle: scheduleTitle,
          targetDate: scheduleDate || selectedDate,
          startMinute: startMin,
          durationMinutes: scheduleDuration,
        }),
      });

      if (res.ok) {
        setScheduleModalOpen(false);
        setScheduleTitle('');
        setScheduleTaskId(null);
        await loadWeekTimeline();
      } else {
        Alert.alert('Scheduling Error', 'Failed to schedule task');
      }
    } catch (e) {
      console.error('Schedule error:', e);
      Alert.alert('Error', 'Network error while scheduling');
    } finally {
      setIsMutating(false);
    }
  };

  // Hard-select card into floating state (Google Calendar / Notion Calendar style)
  const handleHardSelect = (block: TimelineBlock, dateStr: string) => {
    const startMin = block.planned?.startMinute ?? 9 * 60;
    const durMin = block.planned?.durationMinutes ?? 60;
    const hour = Math.floor(startMin / 60);
    const minute = startMin % 60;

    setHardSelectBlockId(block.blockId);
    setFloatingState({
      block,
      sourceDate: dateStr,
      targetDate: dateStr,
      targetHour: hour,
      targetMinute: minute,
      durationMinutes: durMin,
    });
  };

  // Commit floating move to backend with optimistic update
  const handleCommitFloatingMove = async () => {
    if (!floatingState) return;
    const { block, sourceDate, targetDate, targetHour, targetMinute, durationMinutes } = floatingState;
    const occId = (block.occurrenceId || block.blockId || "").replace("occ_", "");
    const newStartMinute = targetHour * 60 + targetMinute;
    const newStartTime = `${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}`;

    setIsMutating(true);
    // Optimistic UI update
    setWeekProjections((prev) => {
      const next = { ...prev };
      // Remove from source date
      if (next[sourceDate]) {
        next[sourceDate] = {
          ...next[sourceDate],
          blocks: next[sourceDate].blocks.filter((b) => b.blockId !== block.blockId),
        };
      }
      // Add or update on target date
      if (next[targetDate]) {
        const updatedBlock: TimelineBlock = {
          ...block,
          planned: {
            startMinute: newStartMinute,
            endMinute: newStartMinute + durationMinutes,
            durationMinutes,
          },
        };
        next[targetDate] = {
          ...next[targetDate],
          blocks: [...next[targetDate].blocks.filter((b) => b.blockId !== block.blockId), updatedBlock],
        };
      }
      return next;
    });

    setFloatingState(null);
    setHardSelectBlockId(null);

    try {
      const res = await fetchWithAuth('/calendar/mutate', {
        method: 'POST',
        body: JSON.stringify({
          actionType: 'reschedule_occurrence',
          payload: {
            occurrenceId: occId,
            newDateOnly: targetDate,
            newStartTime,
            newDurationMinutes: durationMinutes,
          },
        }),
      });

      if (!res.ok) {
        await loadWeekTimeline();
      }
    } catch (e) {
      console.error('Error committing floating move:', e);
      await loadWeekTimeline();
    } finally {
      setIsMutating(false);
    }
  };

  // Reschedule occurrence mutation
  const handleRescheduleBlock = async (offsetHours: number) => {
    if (!selectedBlock?.occurrenceId && !selectedBlock?.planned) return;
    setIsMutating(true);
    try {
      const currentStart = selectedBlock.planned?.startMinute ?? 9 * 60;
      const dur = selectedBlock.planned?.durationMinutes ?? 60;
      const newStartMin = Math.max(0, Math.min(1440 - dur, currentStart + offsetHours * 60));

      const pad = (n: number) => String(n).padStart(2, '0');
      const sH = Math.floor(newStartMin / 60);
      const sM = newStartMin % 60;

      const res = await fetchWithAuth('/calendar/mutate', {
        method: 'POST',
        body: JSON.stringify({
          actionType: 'reschedule_occurrence',
          payload: {
            occurrenceId: (selectedBlock.occurrenceId || selectedBlock.blockId || "").replace("occ_", ""),
            newDateOnly: selectedDate,
            newStartTime: `${pad(sH)}:${pad(sM)}`,
            newDurationMinutes: dur,
          },
        }),
      });

      if (res.ok) {
        setSelectedBlock(null);
        await loadWeekTimeline();
      }
    } catch (e) {
      console.error('Reschedule error:', e);
    } finally {
      setIsMutating(false);
    }
  };

  // Complete occurrence mutation
  const handleCompleteBlock = async () => {
    if (!selectedBlock) return;
    setIsMutating(true);
    try {
      const res = await fetchWithAuth('/calendar/mutate', {
        method: 'POST',
        body: JSON.stringify({
          action: 'complete_occurrence',
          occurrenceId: selectedBlock.occurrenceId || selectedBlock.blockId,
          completedAt: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setSelectedBlock(null);
        await loadWeekTimeline();
      }
    } catch (e) {
      console.error('Complete error:', e);
    } finally {
      setIsMutating(false);
    }
  };

  // Log time mutation
  const handleConfirmLogTime = async () => {
    const mins = parseInt(logMinutes, 10);
    if (!mins || mins <= 0) {
      Alert.alert('Invalid Duration', 'Please enter a valid number of minutes');
      return;
    }
    setIsMutating(true);
    try {
      const res = await fetchWithAuth('/calendar/mutate', {
        method: 'POST',
        body: JSON.stringify({
          action: 'log_time',
          taskId: selectedBlock?.occurrenceId || `log-${Date.now()}`,
          taskTitle: logTaskTitle || selectedBlock?.title || 'Focused Execution',
          minutesSpent: mins,
          dateOnly: selectedDate,
        }),
      });
      if (res.ok) {
        setLogTimeModalOpen(false);
        setLogTaskTitle('');
        await loadWeekTimeline();
      }
    } catch (e) {
      console.error('Log time error:', e);
    } finally {
      setIsMutating(false);
    }
  };

  // Quick plan focus block with Aven
  const handlePlanFocusBlock = async () => {
    setIsMutating(true);
    try {
      const res = await fetchWithAuth('/calendar/mutate', {
        method: 'POST',
        body: JSON.stringify({
          action: 'schedule_task',
          taskId: `focus-${Date.now()}`,
          taskTitle: 'Deep Work & Strategic Focus',
          targetDate: selectedDate,
          startMinute: 600, // 10:00 AM
          durationMinutes: 90,
        }),
      });
      if (res.ok) {
        await loadWeekTimeline();
        Alert.alert('Focus Block Scheduled', 'Aven planned a 90-minute focus session at 10:00 AM.');
      }
    } catch (e) {
      console.error('Focus block error:', e);
    } finally {
      setIsMutating(false);
    }
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return (
    <View style={styles.container}>
      {/* ─── 1. Header Bar ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subTitle}>Your time, in one place.</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.logTimeHeaderBtn}
            onPress={() => {
              setLogTaskTitle('');
              setLogTimeModalOpen(true);
            }}
          >
            <Clock size={14} color="#E8414A" />
            <Text style={styles.logTimeHeaderText}>Log</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.scheduleHeaderBtn}
            onPress={() => {
              setScheduleTaskId(null);
              setScheduleTitle('');
              setScheduleDate(selectedDate);
              setScheduleModalOpen(true);
            }}
          >
            <Plus size={15} color="#FFFFFF" />
            <Text style={styles.scheduleHeaderText}>Schedule</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/voice-call')}
            style={styles.voiceBtn}
          >
            <Mic size={17} color="#FFFDFC" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── 2. View Mode Tabs (Day | Week | Agenda) ─── */}
      <View style={styles.viewTabsContainer}>
        <TouchableOpacity
          style={[styles.viewTab, viewMode === 'day' && styles.viewTabActive]}
          onPress={() => setViewMode('day')}
        >
          <Text style={[styles.viewTabText, viewMode === 'day' && styles.viewTabTextActive]}>Day</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewTab, viewMode === 'week' && styles.viewTabActive]}
          onPress={() => setViewMode('week')}
        >
          <Text style={[styles.viewTabText, viewMode === 'week' && styles.viewTabTextActive]}>Week</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewTab, viewMode === 'agenda' && styles.viewTabActive]}
          onPress={() => setViewMode('agenda')}
        >
          <Text style={[styles.viewTabText, viewMode === 'agenda' && styles.viewTabTextActive]}>Agenda</Text>
        </TouchableOpacity>
      </View>

      {/* ─── 3. Date Navigation & Today Switcher ─── */}
      <View style={styles.dateNavRow}>
        <View style={styles.navArrows}>
          <TouchableOpacity onPress={handlePrev} style={styles.arrowBtn}>
            <ChevronLeft size={16} color="#ECE7E3" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleToday} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNext} style={styles.arrowBtn}>
            <ChevronRight size={16} color="#ECE7E3" />
          </TouchableOpacity>
        </View>

        <Text style={styles.dateTitleText}>
          {viewMode === 'week'
            ? `${weekDays[0].name}, ${weekDays[0].dayNum} – ${weekDays[6].name}, ${weekDays[6].dayNum}`
            : new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
        </Text>
      </View>

      {/* ─── 4. 7-Day Week Strip with Event Dots ─── */}
      <View style={styles.weekStrip}>
        {weekDays.map((d) => {
          const dayProj = weekProjections[d.dateStr];
          const hasEvents = dayProj && dayProj.blocks.length > 0;
          const isFloatingTarget = floatingState?.targetDate === d.dateStr;

          return (
            <TouchableOpacity
              key={d.dateStr}
              style={[
                styles.weekDayPill,
                d.isSelected && styles.weekDayPillSelected,
                d.isToday && !d.isSelected && styles.weekDayPillToday,
                isFloatingTarget && styles.weekDayPillTarget,
              ]}
              onPress={() => {
                if (floatingState) {
                  setFloatingState((prev) => (prev ? { ...prev, targetDate: d.dateStr } : null));
                } else {
                  setSelectedDate(d.dateStr);
                }
              }}
            >
              <Text
                style={[
                  styles.weekDayName,
                  d.isSelected && styles.weekDayTextActive,
                  d.isToday && !d.isSelected && styles.weekDayTextToday,
                  isFloatingTarget && { color: '#E8414A', fontWeight: '800' },
                ]}
              >
                {d.name}
              </Text>
              <Text
                style={[
                  styles.weekDayNum,
                  d.isSelected && styles.weekDayTextActive,
                  d.isToday && !d.isSelected && styles.weekDayTextToday,
                  isFloatingTarget && { color: '#FFFFFF', fontWeight: '800' },
                ]}
              >
                {d.dayNum}
              </Text>
              {hasEvents && (
                <View
                  style={[
                    styles.eventDot,
                    d.isSelected ? { backgroundColor: '#FFFFFF' } : { backgroundColor: '#E8414A' },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─── FLOATING CARD HUD (Google Calendar / Notion Calendar Style) ─── */}
      {floatingState && (
        <View style={styles.floatingHudContainer}>
          <View style={styles.floatingHudHeader}>
            <View style={styles.floatingHudLeft}>
              <View style={styles.floatingHudPill}>
                <View style={styles.floatingDot} />
                <Text style={styles.floatingHudStatus}>MOVING</Text>
              </View>
              <Text style={styles.floatingHudTitle} numberOfLines={1}>
                {floatingState.block.title}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setFloatingState(null);
                setHardSelectBlockId(null);
              }}
              style={styles.floatingHudCloseBtn}
            >
              <X size={16} color="#ECE7E3" />
            </TouchableOpacity>
          </View>

          {/* Target time */}
          <View style={styles.floatingHudTargetRow}>
            <Clock size={13} color="#E8414A" />
            <Text style={styles.floatingHudTargetText}>
              Target: {floatingState.targetDate} at {formatMinutes(floatingState.targetHour * 60 + floatingState.targetMinute)}
            </Text>
            <Text style={styles.floatingHudDurationText}>
              ({floatingState.durationMinutes}m)
            </Text>
          </View>

          {/* Quick nudge buttons */}
          <View style={styles.floatingHudNudgeRow}>
            <TouchableOpacity
              style={styles.nudgeBtn}
              onPress={() => {
                setFloatingState((prev) => {
                  if (!prev) return null;
                  const newHour = Math.max(0, prev.targetHour - 1);
                  return { ...prev, targetHour: newHour };
                });
              }}
            >
              <Text style={styles.nudgeBtnText}>-1 hr</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nudgeBtn}
              onPress={() => {
                setFloatingState((prev) => {
                  if (!prev) return null;
                  const newHour = Math.min(23, prev.targetHour + 1);
                  return { ...prev, targetHour: newHour };
                });
              }}
            >
              <Text style={styles.nudgeBtnText}>+1 hr</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nudgeBtn}
              onPress={() => {
                setFloatingState((prev) => {
                  if (!prev) return null;
                  const d = new Date(`${prev.targetDate}T12:00:00Z`);
                  d.setUTCDate(d.getUTCDate() - 1);
                  return { ...prev, targetDate: d.toISOString().split('T')[0] };
                });
              }}
            >
              <Text style={styles.nudgeBtnText}>-1 day</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nudgeBtn}
              onPress={() => {
                setFloatingState((prev) => {
                  if (!prev) return null;
                  const d = new Date(`${prev.targetDate}T12:00:00Z`);
                  d.setUTCDate(d.getUTCDate() + 1);
                  return { ...prev, targetDate: d.toISOString().split('T')[0] };
                });
              }}
            >
              <Text style={styles.nudgeBtnText}>+1 day</Text>
            </TouchableOpacity>
          </View>

          {/* Hint & Commit CTA */}
          <View style={styles.floatingHudActionRow}>
            <Text style={styles.floatingHudHint}>
              Tap any hour/day slot below or confirm:
            </Text>
            <TouchableOpacity
              style={styles.floatingDropBtn}
              onPress={handleCommitFloatingMove}
              disabled={isMutating}
            >
              <Check size={14} color="#FFFDFC" />
              <Text style={styles.floatingDropBtnText}>
                {isMutating ? 'Dropping...' : 'Drop Here'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── 5. Summary Metrics Bar ─── */}
      <View style={styles.metricsBar}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>{viewMode === 'week' ? 'Week planned' : 'Planned focus'}</Text>
          <Text style={styles.metricValue}>
            {viewMode === 'week'
              ? `${Math.floor(weekSummary.planned / 60)}h ${weekSummary.planned % 60}m`
              : `${Math.floor((projection?.summary.totalPlannedMinutes || 0) / 60)}h ${(projection?.summary.totalPlannedMinutes || 0) % 60}m`}
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>{viewMode === 'week' ? 'Week spent' : 'Time spent'}</Text>
          <Text style={[styles.metricValue, { color: '#E8414A' }]}>
            {viewMode === 'week'
              ? `${Math.floor(weekSummary.actual / 60)}h ${weekSummary.actual % 60}m`
              : `${Math.floor((projection?.summary.totalActualMinutes || 0) / 60)}h ${(projection?.summary.totalActualMinutes || 0) % 60}m`}
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Completed</Text>
          <Text style={[styles.metricValue, { color: '#10B981' }]}>
            {viewMode === 'week' ? weekSummary.completed : projection?.summary.completedOccurrencesCount || 0}
          </Text>
        </View>
      </View>

      {/* ─── 6. Main Calendar Content Area ─── */}
      {loading && Object.keys(weekProjections).length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color="#E8414A" size="large" />
          <Text style={styles.loadingText}>Loading calendar...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={{ paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* VIEW: WEEK (Spacious Day-by-Day Cards Overview)                 */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {viewMode === 'week' && (
            <View style={styles.weekContainer}>
              {weekDays.map((d) => {
                const dayProj = weekProjections[d.dateStr];
                const blocks = dayProj?.blocks || [];
                const isSelectedDay = d.dateStr === selectedDate;

                return (
                  <View
                    key={d.dateStr}
                    style={[
                      styles.weekDaySectionCard,
                      isSelectedDay && styles.weekDaySectionCardActive,
                      d.isToday && styles.weekDaySectionCardToday,
                    ]}
                  >
                    {/* Day Section Header */}
                    <View style={styles.weekDaySectionHeader}>
                      <View style={styles.weekDaySectionHeaderLeft}>
                        <View
                          style={[
                            styles.weekDayBadge,
                            d.isToday ? styles.weekDayBadgeToday : styles.weekDayBadgeRegular,
                          ]}
                        >
                          <Text
                            style={[
                              styles.weekDayBadgeText,
                              d.isToday ? { color: '#FFFFFF' } : { color: '#ECE7E3' },
                            ]}
                          >
                            {d.name} {d.dayNum}
                          </Text>
                        </View>
                        <Text style={styles.weekDayFullLabel}>
                          {d.isToday ? 'Today' : d.name}
                        </Text>
                      </View>

                      <View style={styles.weekDaySectionHeaderRight}>
                        {blocks.length > 0 && (
                          <Text style={styles.weekDayTaskCount}>
                            {blocks.length} {blocks.length === 1 ? 'task' : 'tasks'}
                          </Text>
                        )}
                        <TouchableOpacity
                          style={styles.weekDayAddBtn}
                          onPress={() => {
                            setScheduleDate(d.dateStr);
                            setScheduleTaskId(null);
                            setScheduleTitle('');
                            setScheduleModalOpen(true);
                          }}
                        >
                          <Plus size={14} color="#E8414A" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Day's Scheduled Blocks */}
                    {blocks.length === 0 ? (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          setScheduleDate(d.dateStr);
                          setScheduleTaskId(null);
                          setScheduleTitle('');
                          setScheduleModalOpen(true);
                        }}
                        style={styles.weekDayEmptySlot}
                      >
                        <Text style={styles.weekDayEmptySlotText}>
                          No tasks scheduled • Tap to plan
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.weekDayBlocksList}>
                        {blocks.map((block) => {
                          const isHard = block.kind === 'HARD_EVENT';
                          const isRoutine = block.kind === 'ROUTINE_BLOCK';
                          const isDone = !!block.actual || block.variance.status === 'ON_TRACK';

                          let accentColor = '#E8414A';
                          if (isHard) accentColor = '#EF4444';
                          else if (isRoutine) accentColor = '#F59E0B';
                          else if (isDone) accentColor = '#10B981';

                          const isHardSelected = hardSelectBlockId === block.blockId;

                          return (
                            <TouchableOpacity
                              key={block.blockId}
                              activeOpacity={0.8}
                              onLongPress={() => handleHardSelect(block, d.dateStr)}
                              delayLongPress={220}
                              style={[
                                styles.weekBlockCard,
                                { borderLeftColor: accentColor },
                                isHardSelected && styles.hardSelectedBlockCard,
                              ]}
                              onPress={() => {
                                if (floatingState) return;
                                setSelectedBlock(block);
                              }}
                            >
                              <View style={styles.weekBlockCardContent}>
                                <View style={styles.weekBlockCardTop}>
                                  <Text style={styles.weekBlockTitle} numberOfLines={1}>
                                    {block.title}
                                  </Text>
                                  {isHardSelected ? (
                                    <View style={styles.floatingBadge}>
                                      <Text style={styles.floatingBadgeText}>FLOATING</Text>
                                    </View>
                                  ) : isDone ? (
                                    <CheckCircle2 size={14} color="#10B981" />
                                  ) : null}
                                </View>

                                {block.planned && (
                                  <Text style={styles.weekBlockTime}>
                                    {formatMinutes(block.planned.startMinute)} –{' '}
                                    {formatMinutes(block.planned.endMinute)} ({block.planned.durationMinutes}m)
                                  </Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* Quick drop target in Week view when a block is floating */}
                    {floatingState && (
                      <TouchableOpacity
                        style={styles.weekDropSlot}
                        onPress={() => {
                          setFloatingState((prev) => (prev ? { ...prev, targetDate: d.dateStr } : null));
                        }}
                      >
                        <View style={styles.weekDropSlotContent}>
                          <Clock size={12} color="#E8414A" />
                          <Text style={styles.weekDropSlotText}>
                            {floatingState.targetDate === d.dateStr
                              ? `✓ Drop here at ${formatMinutes(floatingState.targetHour * 60 + floatingState.targetMinute)}`
                              : `Move to ${d.name}`}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* VIEW: DAY (Spacious 24-Hour Vertical Timeline)                  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {viewMode === 'day' && (
            <ScrollView
              ref={dayScrollRef}
              nestedScrollEnabled
              style={styles.dayTimelineScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.timelineCanvas}>
                {/* 24 Hour Dividing Rows */}
                {Array.from({ length: 24 }).map((_, h) => (
                  <TouchableOpacity
                    key={`day-hour-${h}`}
                    style={[
                      styles.hourRow,
                      { top: h * HOUR_HEIGHT, height: HOUR_HEIGHT },
                      floatingState?.targetHour === h && styles.hourRowHighlight,
                    ]}
                    activeOpacity={0.6}
                    onPress={() => {
                      if (floatingState) {
                        setFloatingState((prev) => (prev ? { ...prev, targetHour: h, targetMinute: 0 } : null));
                      } else {
                        setScheduleDate(selectedDate);
                        setScheduleHour(h);
                        setScheduleTaskId(null);
                        setScheduleTitle('');
                        setScheduleModalOpen(true);
                      }
                    }}
                  >
                    <View style={styles.timeLabelContainer}>
                      <Text style={styles.timeLabelText}>{formatHourLabel(h)}</Text>
                    </View>
                    <View style={styles.hourDividerLine} />
                  </TouchableOpacity>
                ))}

                {/* Ghost drop preview when card is floating in Day View */}
                {floatingState && floatingState.targetDate === selectedDate && (
                  <View
                    style={[
                      styles.ghostDropCard,
                      {
                        top: (floatingState.targetHour + floatingState.targetMinute / 60) * HOUR_HEIGHT,
                        height: Math.max(34, (floatingState.durationMinutes / 60) * HOUR_HEIGHT - 3),
                      },
                    ]}
                  >
                    <View style={styles.ghostDropHeader}>
                      <View style={styles.ghostPulseDot} />
                      <Text style={styles.ghostDropTitle} numberOfLines={1}>
                        Drop: {floatingState.block.title}
                      </Text>
                    </View>
                    <Text style={styles.ghostDropTime}>
                      {formatMinutes(floatingState.targetHour * 60 + floatingState.targetMinute)} –{' '}
                      {formatMinutes(floatingState.targetHour * 60 + floatingState.targetMinute + floatingState.durationMinutes)}
                    </Text>
                  </View>
                )}

                {/* Real-time Red Current Time Line across 24 Hours */}
                {isToday && (
                  <View
                    style={[
                      styles.nowIndicatorLine,
                      {
                        top: (currentMinute / 60) * HOUR_HEIGHT,
                      },
                    ]}
                  >
                    <View style={styles.nowIndicatorDot} />
                    <View style={styles.nowIndicatorBar} />
                  </View>
                )}

                {/* Scheduled Event Blocks */}
                {projection?.blocks.map((block) => {
                  const startMin = block.planned?.startMinute ?? 9 * 60;
                  const durMin = block.planned?.durationMinutes ?? 60;
                  const topPos = (startMin / 60) * HOUR_HEIGHT;
                  const blockHeight = Math.max(34, (durMin / 60) * HOUR_HEIGHT - 3);

                  const isHard = block.kind === 'HARD_EVENT';
                  const isRoutine = block.kind === 'ROUTINE_BLOCK';
                  const isDone = block.variance.status === 'ON_TRACK' || !!block.actual;
                  const isHardSelected = hardSelectBlockId === block.blockId;

                  let accentColor = '#E8414A';
                  if (isHard) accentColor = '#EF4444';
                  else if (isRoutine) accentColor = '#F59E0B';
                  else if (isDone) accentColor = '#10B981';

                  return (
                    <TouchableOpacity
                      key={block.blockId}
                      activeOpacity={0.8}
                      onLongPress={() => handleHardSelect(block, selectedDate)}
                      delayLongPress={220}
                      onPress={() => {
                        if (floatingState) return;
                        setSelectedBlock(block);
                      }}
                      style={[
                        styles.dayBlockCard,
                        {
                          top: topPos,
                          height: blockHeight,
                          borderLeftColor: accentColor,
                        },
                        isHardSelected && styles.hardSelectedBlockCard,
                      ]}
                    >
                      <View style={styles.dayBlockHeader}>
                        <Text style={styles.dayBlockTitle} numberOfLines={1}>
                          {block.title}
                        </Text>
                        {isHardSelected ? (
                          <View style={styles.floatingBadge}>
                            <Text style={styles.floatingBadgeText}>FLOATING</Text>
                          </View>
                        ) : isDone ? (
                          <CheckCircle2 size={13} color="#10B981" />
                        ) : null}
                      </View>

                      {block.planned && blockHeight >= 42 && (
                        <Text style={styles.dayBlockTimeText} numberOfLines={1}>
                          {formatMinutes(block.planned.startMinute)} –{' '}
                          {formatMinutes(block.planned.endMinute)} ({block.planned.durationMinutes}m)
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* VIEW: AGENDA (Chronological List)                               */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {viewMode === 'agenda' && (
            <View style={styles.agendaContainer}>
              {projection?.blocks.length === 0 ? (
                <View style={styles.centerContainer}>
                  <CalendarIcon size={36} color="#444" />
                  <Text style={styles.emptyTitle}>No scheduled events</Text>
                  <Text style={styles.emptySubtitle}>Tap + Schedule to plan your day</Text>
                </View>
              ) : (
                projection?.blocks.map((block) => {
                  const isHard = block.kind === 'HARD_EVENT';
                  const isRoutine = block.kind === 'ROUTINE_BLOCK';
                  const isDone = !!block.actual || block.variance.status === 'ON_TRACK';
                  const isHardSelected = hardSelectBlockId === block.blockId;

                  return (
                    <TouchableOpacity
                      key={block.blockId}
                      activeOpacity={0.8}
                      onLongPress={() => handleHardSelect(block, selectedDate)}
                      delayLongPress={220}
                      style={[
                        styles.agendaCard,
                        isHard && styles.hardCard,
                        isRoutine && styles.routineCard,
                        isHardSelected && styles.hardSelectedBlockCard,
                      ]}
                      onPress={() => {
                        if (floatingState) return;
                        setSelectedBlock(block);
                      }}
                    >
                      <View style={styles.agendaCardLeft}>
                        <View
                          style={[
                            styles.agendaIndicator,
                            { backgroundColor: isHard ? '#EF4444' : isRoutine ? '#F59E0B' : '#E8414A' },
                          ]}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.agendaTitle}>{block.title}</Text>
                          {block.planned && (
                            <Text style={styles.agendaTime}>
                              {formatMinutes(block.planned.startMinute)} –{' '}
                              {formatMinutes(block.planned.endMinute)} ({block.planned.durationMinutes}m)
                            </Text>
                          )}
                          {block.actual && (
                            <Text style={styles.agendaActual}>
                              Time spent: {block.actual.durationMinutes}m
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.agendaCardRight}>
                        {isDone ? (
                          <View style={styles.doneBadge}>
                            <Check size={12} color="#10B981" />
                            <Text style={styles.doneBadgeText}>Done</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.rescheduleQuickBtn}
                            onPress={() => setSelectedBlock(block)}
                          >
                            <RotateCw size={13} color="#999" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* ─── 7. Tasks to Schedule Tray ─── */}
          {tasksToSchedule.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleRow}>
                  <ListTodo size={15} color="#E8414A" />
                  <Text style={styles.sectionTitle}>Tasks to schedule</Text>
                </View>
                <Text style={styles.sectionBadge}>{tasksToSchedule.length}</Text>
              </View>

              {tasksToSchedule.map((task) => (
                <View key={task.id} style={styles.unscheduledTaskRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unscheduledTaskTitle}>{task.title}</Text>
                    <Text style={styles.unscheduledTaskMeta}>
                      {task.priority || 'Medium'} • {task.estimatedDurationMinutes || 45}m
                      {task.goalTitle ? ` • ${task.goalTitle}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.taskScheduleBtn}
                    onPress={() => {
                      setScheduleTaskId(task.id);
                      setScheduleTitle(task.title);
                      setScheduleDate(selectedDate);
                      setScheduleDuration(task.estimatedDurationMinutes || 60);
                      setScheduleModalOpen(true);
                    }}
                  >
                    <Plus size={13} color="#E8414A" />
                    <Text style={styles.taskScheduleBtnText}>Schedule</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* ─── 8. Aven's RoutineAI Suggestion ─── */}
          <View style={styles.avenSuggestionCard}>
            <View style={styles.avenHeaderRow}>
              <Sparkles size={15} color="#E8414A" />
              <Text style={styles.avenTitle}>Aven&apos;s Suggestion</Text>
            </View>
            <Text style={styles.avenDesc}>
              You usually focus best between 10 AM and 1 PM. Your morning cadence has lowest interruptions.
            </Text>
            <TouchableOpacity style={styles.avenActionBtn} onPress={handlePlanFocusBlock}>
              <Flame size={14} color="#FFFFFF" />
              <Text style={styles.avenActionBtnText}>Plan focus block</Text>
              <ArrowRight size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ─── 9. SCHEDULE TASK MODAL ─── */}
      <Modal visible={scheduleModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule Event</Text>
              <TouchableOpacity onPress={() => setScheduleModalOpen(false)}>
                <X size={20} color="#888" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Task Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Design review, Strategic work"
              placeholderTextColor="#666"
              value={scheduleTitle}
              onChangeText={setScheduleTitle}
            />

            <Text style={styles.inputLabel}>Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeChipsScroll}>
              {weekDays.map((d) => (
                <TouchableOpacity
                  key={`pick-d-${d.dateStr}`}
                  style={[styles.timeChip, scheduleDate === d.dateStr && styles.timeChipActive]}
                  onPress={() => setScheduleDate(d.dateStr)}
                >
                  <Text style={[styles.timeChipText, scheduleDate === d.dateStr && styles.timeChipTextActive]}>
                    {d.name} {d.dayNum}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Start Hour</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeChipsScroll}>
              {Array.from({ length: 24 }).map((_, h) => (
                <TouchableOpacity
                  key={`pick-h-${h}`}
                  style={[styles.timeChip, scheduleHour === h && styles.timeChipActive]}
                  onPress={() => setScheduleHour(h)}
                >
                  <Text style={[styles.timeChipText, scheduleHour === h && styles.timeChipTextActive]}>
                    {formatHourLabel(h)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Duration</Text>
            <View style={styles.durationsRow}>
              {[30, 45, 60, 90, 120].map((dur) => (
                <TouchableOpacity
                  key={`dur-${dur}`}
                  style={[styles.durationBtn, scheduleDuration === dur && styles.durationBtnActive]}
                  onPress={() => setScheduleDuration(dur)}
                >
                  <Text style={[styles.durationBtnText, scheduleDuration === dur && styles.durationBtnTextActive]}>
                    {dur}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={handleConfirmSchedule}
              disabled={isMutating}
            >
              {isMutating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>Schedule Event</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── 10. BLOCK ACTIONS / RESCHEDULE MODAL ─── */}
      <Modal visible={!!selectedBlock} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedBlock?.title}
                </Text>
                {selectedBlock?.planned && (
                  <Text style={styles.modalSubTitle}>
                    {formatMinutes(selectedBlock.planned.startMinute)} –{' '}
                    {formatMinutes(selectedBlock.planned.endMinute)} ({selectedBlock.planned.durationMinutes}m)
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setSelectedBlock(null)}>
                <X size={20} color="#888" />
              </TouchableOpacity>
            </View>

            <Text style={styles.actionSectionTitle}>Quick Reschedule</Text>
            <View style={styles.rescheduleGrid}>
              <TouchableOpacity
                style={styles.rescheduleBtn}
                onPress={() => handleRescheduleBlock(-1)}
                disabled={isMutating}
              >
                <Text style={styles.rescheduleBtnText}>- 1 Hour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rescheduleBtn}
                onPress={() => handleRescheduleBlock(-0.5)}
                disabled={isMutating}
              >
                <Text style={styles.rescheduleBtnText}>- 30 Mins</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rescheduleBtn}
                onPress={() => handleRescheduleBlock(0.5)}
                disabled={isMutating}
              >
                <Text style={styles.rescheduleBtnText}>+ 30 Mins</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rescheduleBtn}
                onPress={() => handleRescheduleBlock(1)}
                disabled={isMutating}
              >
                <Text style={styles.rescheduleBtnText}>+ 1 Hour</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.completeActionBtn}
                onPress={handleCompleteBlock}
                disabled={isMutating}
              >
                <CheckCircle2 size={16} color="#10B981" />
                <Text style={styles.completeActionBtnText}>Mark Done</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.logTimeActionBtn}
                onPress={() => {
                  setLogTaskTitle(selectedBlock?.title || '');
                  setSelectedBlock(null);
                  setLogTimeModalOpen(true);
                }}
              >
                <Clock size={16} color="#FFFFFF" />
                <Text style={styles.logTimeActionBtnText}>Log Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── 11. LOG TIME MODAL ─── */}
      <Modal visible={logTimeModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Execution Time</Text>
              <TouchableOpacity onPress={() => setLogTimeModalOpen(false)}>
                <X size={20} color="#888" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Task Description</Text>
            <TextInput
              style={styles.textInput}
              placeholder="What did you focus on?"
              placeholderTextColor="#666"
              value={logTaskTitle}
              onChangeText={setLogTaskTitle}
            />

            <Text style={styles.inputLabel}>Minutes Spent</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={logMinutes}
              onChangeText={setLogMinutes}
            />

            <View style={styles.durationsRow}>
              {['15', '30', '45', '60', '90', '120'].map((mins) => (
                <TouchableOpacity
                  key={`log-min-${mins}`}
                  style={[styles.durationBtn, logMinutes === mins && styles.durationBtnActive]}
                  onPress={() => setLogMinutes(mins)}
                >
                  <Text style={[styles.durationBtnText, logMinutes === mins && styles.durationBtnTextActive]}>
                    {mins}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={handleConfirmLogTime}
              disabled={isMutating}
            >
              {isMutating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>Save Time Entry</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFDFC',
    letterSpacing: -0.5,
  },
  subTitle: {
    color: '#8A8F9D',
    fontSize: 11,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  logTimeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2129',
    borderColor: '#2F333D',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    gap: 4,
  },
  logTimeHeaderText: {
    color: '#ECE7E3',
    fontSize: 11,
    fontWeight: '600',
  },
  scheduleHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8414A',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9,
    gap: 4,
  },
  scheduleHeaderText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  voiceBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1F2023',
    borderColor: '#2A2B2F',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#161922',
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 2.5,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#242834',
  },
  viewTab: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 8,
  },
  viewTabActive: {
    backgroundColor: '#262A36',
  },
  viewTabText: {
    color: '#7D8494',
    fontSize: 12,
    fontWeight: '600',
  },
  viewTabTextActive: {
    color: '#FFFDFC',
    fontWeight: '700',
  },
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  navArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  arrowBtn: {
    padding: 5,
    borderRadius: 7,
    backgroundColor: '#1C1F28',
    borderWidth: 1,
    borderColor: '#282C38',
  },
  todayBtn: {
    backgroundColor: '#E8414A',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
  },
  todayBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  dateTitleText: {
    color: '#FFFDFC',
    fontSize: 13,
    fontWeight: '700',
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  weekDayPill: {
    width: (SCREEN_WIDTH - 32 - 24) / 7,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#242834',
    position: 'relative',
  },
  weekDayPillSelected: {
    backgroundColor: '#E8414A',
    borderColor: '#E8414A',
  },
  weekDayPillToday: {
    borderColor: '#E8414A',
  },
  weekDayName: {
    color: '#7C8292',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 1,
  },
  weekDayNum: {
    color: '#FFFDFC',
    fontSize: 13,
    fontWeight: '700',
  },
  weekDayTextActive: {
    color: '#FFFFFF',
  },
  weekDayTextToday: {
    color: '#E8414A',
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#161922',
    marginHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242834',
    marginBottom: 10,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    color: '#7D8494',
    fontSize: 9,
    fontWeight: '500',
  },
  metricValue: {
    color: '#FFFDFC',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#262A36',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    color: '#888',
    fontSize: 12,
    marginTop: 10,
  },
  emptyTitle: {
    color: '#aaa',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 12,
    marginTop: 3,
    textAlign: 'center',
  },
  mainScrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  weekContainer: {
    gap: 10,
    marginBottom: 16,
  },
  weekDaySectionCard: {
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#242834',
  },
  weekDaySectionCardActive: {
    borderColor: '#3D4252',
    backgroundColor: '#191C26',
  },
  weekDaySectionCardToday: {
    borderColor: '#E8414A',
  },
  weekDaySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekDaySectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekDayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  weekDayBadgeToday: {
    backgroundColor: '#E8414A',
  },
  weekDayBadgeRegular: {
    backgroundColor: '#222632',
  },
  weekDayBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  weekDayFullLabel: {
    color: '#FFFDFC',
    fontSize: 13,
    fontWeight: '700',
  },
  weekDaySectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekDayTaskCount: {
    color: '#7D8494',
    fontSize: 11,
    fontWeight: '600',
  },
  weekDayAddBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(232, 65, 74, 0.12)',
  },
  weekDayEmptySlot: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#202430',
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  weekDayEmptySlotText: {
    color: '#606575',
    fontSize: 11,
    fontWeight: '500',
  },
  weekDayBlocksList: {
    gap: 6,
  },
  weekBlockCard: {
    backgroundColor: '#222632',
    borderWidth: 1,
    borderColor: '#2D3242',
    borderLeftWidth: 3.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  weekBlockCardContent: {
    gap: 2,
  },
  weekBlockCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  weekBlockTitle: {
    color: '#FFFDFC',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  weekBlockTime: {
    color: '#8E94A4',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  dayTimelineScroll: {
    maxHeight: 520,
    marginBottom: 16,
  },
  timelineCanvas: {
    height: 24 * HOUR_HEIGHT,
    position: 'relative',
    backgroundColor: '#12141B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#20242F',
    overflow: 'hidden',
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeLabelContainer: {
    width: 58,
    paddingLeft: 8,
    paddingTop: 3,
  },
  timeLabelText: {
    color: '#686F80',
    fontSize: 10,
    fontWeight: '600',
  },
  hourDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#20242F',
    marginTop: 8,
  },
  nowIndicatorLine: {
    position: 'absolute',
    left: 54,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  nowIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8414A',
    marginLeft: -4,
  },
  nowIndicatorBar: {
    flex: 1,
    height: 2,
    backgroundColor: '#E8414A',
  },
  dayBlockCard: {
    position: 'absolute',
    left: 62,
    right: 8,
    backgroundColor: '#26282E',
    borderColor: '#3E424B',
    borderWidth: 1,
    borderLeftWidth: 3.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 10,
    justifyContent: 'center',
  },
  dayBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  dayBlockTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  dayBlockTimeText: {
    color: '#9E9FA4',
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  agendaContainer: {
    gap: 8,
    marginBottom: 16,
  },
  agendaCard: {
    backgroundColor: '#181B24',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#262A36',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hardCard: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  routineCard: {
    borderColor: 'rgba(245, 158, 11, 0.3)',
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
  },
  agendaCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  agendaIndicator: {
    width: 3.5,
    height: 34,
    borderRadius: 2,
  },
  agendaTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  agendaTime: {
    color: '#8E94A4',
    fontSize: 10,
    marginTop: 2,
  },
  agendaActual: {
    color: '#10B981',
    fontSize: 10,
    marginTop: 1,
  },
  agendaCardRight: {
    marginLeft: 8,
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  doneBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  rescheduleQuickBtn: {
    padding: 7,
    borderRadius: 7,
    backgroundColor: '#222633',
  },
  sectionCard: {
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#242834',
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionTitle: {
    color: '#FFFDFC',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionBadge: {
    color: '#8A8F9D',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#20242F',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  unscheduledTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#20242F',
  },
  unscheduledTaskTitle: {
    color: '#ECE7E3',
    fontSize: 11,
    fontWeight: '600',
  },
  unscheduledTaskMeta: {
    color: '#73798A',
    fontSize: 9,
    marginTop: 1,
  },
  taskScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 65, 74, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    gap: 3,
    marginLeft: 8,
  },
  taskScheduleBtnText: {
    color: '#E8414A',
    fontSize: 10,
    fontWeight: '700',
  },
  avenSuggestionCard: {
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#262A38',
    marginBottom: 20,
  },
  avenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  avenTitle: {
    color: '#FFFDFC',
    fontSize: 12,
    fontWeight: '700',
  },
  avenDesc: {
    color: '#8E94A4',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  avenActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8414A',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  avenActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#161922',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#282C38',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    color: '#FFFDFC',
    fontSize: 15,
    fontWeight: '700',
  },
  modalSubTitle: {
    color: '#8E94A4',
    fontSize: 11,
    marginTop: 1,
  },
  inputLabel: {
    color: '#8E94A4',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 5,
  },
  textInput: {
    backgroundColor: '#1F232D',
    borderColor: '#2B303E',
    borderWidth: 1,
    borderRadius: 9,
    color: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 12,
    marginBottom: 10,
  },
  timeChipsScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  timeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: '#20242F',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#2C3140',
  },
  timeChipActive: {
    backgroundColor: '#E8414A',
    borderColor: '#E8414A',
  },
  timeChipText: {
    color: '#8E94A4',
    fontSize: 10,
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  durationsRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 14,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 7,
    backgroundColor: '#20242F',
    borderWidth: 1,
    borderColor: '#2C3140',
  },
  durationBtnActive: {
    backgroundColor: '#E8414A',
    borderColor: '#E8414A',
  },
  durationBtnText: {
    color: '#8E94A4',
    fontSize: 10,
    fontWeight: '600',
  },
  durationBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  primaryModalBtn: {
    backgroundColor: '#E8414A',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryModalBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  actionSectionTitle: {
    color: '#8E94A4',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 7,
  },
  rescheduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 14,
  },
  rescheduleBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#20242F',
    borderColor: '#2B303E',
    borderWidth: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 7,
  },
  rescheduleBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  completeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: 10,
    gap: 5,
  },
  completeActionBtnText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  logTimeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#262933',
    borderColor: '#373C48',
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: 10,
    gap: 5,
  },
  logTimeActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  weekDayPillTarget: {
    borderColor: '#E8414A',
    backgroundColor: 'rgba(232, 65, 74, 0.15)',
    borderWidth: 1.5,
  },
  hardSelectedBlockCard: {
    borderColor: '#E8414A',
    borderWidth: 2,
    borderLeftWidth: 4,
    transform: [{ scale: 1.03 }],
    shadowColor: '#E8414A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99,
  },
  floatingBadge: {
    backgroundColor: '#E8414A',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  floatingBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ghostDropCard: {
    position: 'absolute',
    left: 62,
    right: 8,
    borderWidth: 2,
    borderColor: '#E8414A',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(232, 65, 74, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 15,
    justifyContent: 'center',
  },
  ghostDropHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ghostPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8414A',
  },
  ghostDropTitle: {
    color: '#E8414A',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  ghostDropTime: {
    color: '#FFFDFC',
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  hourRowHighlight: {
    backgroundColor: 'rgba(232, 65, 74, 0.08)',
  },
  weekDropSlot: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: '#E8414A',
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: 'rgba(232, 65, 74, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDropSlotContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekDropSlotText: {
    color: '#E8414A',
    fontSize: 11,
    fontWeight: '700',
  },
  floatingHudContainer: {
    backgroundColor: '#1C1F2B',
    borderWidth: 1.5,
    borderColor: '#E8414A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#E8414A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
    gap: 8,
  },
  floatingHudHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingHudLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  floatingHudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(232, 65, 74, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8414A',
  },
  floatingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E8414A',
  },
  floatingHudStatus: {
    color: '#E8414A',
    fontSize: 9,
    fontWeight: '800',
  },
  floatingHudTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  floatingHudCloseBtn: {
    padding: 4,
  },
  floatingHudTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  floatingHudTargetText: {
    color: '#FFFDFC',
    fontSize: 12,
    fontWeight: '600',
  },
  floatingHudDurationText: {
    color: '#7D8494',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  floatingHudNudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nudgeBtn: {
    flex: 1,
    backgroundColor: '#262A38',
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#343A4C',
  },
  nudgeBtnText: {
    color: '#ECE7E3',
    fontSize: 10,
    fontWeight: '600',
  },
  floatingHudActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  floatingHudHint: {
    color: '#7D8494',
    fontSize: 10,
    fontStyle: 'italic',
    flex: 1,
  },
  floatingDropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8414A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#E8414A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingDropBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
