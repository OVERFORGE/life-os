import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../utils/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HOUR_HEIGHT = 56; // Height per hour in Day view (24 * 56 = 1344px)

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

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'agenda'>('day');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [projection, setProjection] = useState<TimelineProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  // Modals state
  const [selectedBlock, setSelectedBlock] = useState<TimelineBlock | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [logTimeModalOpen, setLogTimeModalOpen] = useState(false);

  // Scheduling form state
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null);
  const [scheduleHour, setScheduleHour] = useState(9); // Default 9 AM
  const [scheduleDuration, setScheduleDuration] = useState(60);

  // Log time form state
  const [logTaskTitle, setLogTaskTitle] = useState('');
  const [logMinutes, setLogMinutes] = useState('45');

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

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const res = await fetchWithAuth(`/calendar/timeline?date=${selectedDate}&timezone=${encodeURIComponent(tz)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.ok || json.success) {
          setProjection(json.data);
        }
      }
    } catch (e) {
      console.error('Failed to load mobile calendar timeline:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  // Date Navigation handlers
  const handlePrevDay = () => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (viewMode === 'week' ? 7 : 1));
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
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
          targetDate: selectedDate,
          startMinute: startMin,
          durationMinutes: scheduleDuration,
        }),
      });

      if (res.ok) {
        setScheduleModalOpen(false);
        setScheduleTitle('');
        setScheduleTaskId(null);
        await loadTimeline();
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
      const eMin = newStartMin + dur;
      const eH = Math.floor(eMin / 60);
      const eM = eMin % 60;

      const newStartIso = `${selectedDate}T${pad(sH)}:${pad(sM)}:00`;
      const newEndIso = `${selectedDate}T${pad(eH)}:${pad(eM)}:00`;

      const res = await fetchWithAuth('/calendar/mutate', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reschedule_occurrence',
          occurrenceId: selectedBlock.occurrenceId || selectedBlock.blockId,
          newStartIso,
          newEndIso,
        }),
      });

      if (res.ok) {
        setSelectedBlock(null);
        await loadTimeline();
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
        await loadTimeline();
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
        await loadTimeline();
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
        await loadTimeline();
        Alert.alert('Focus Block Scheduled', 'Aven planned a 90-minute focus session starting at 10:00 AM.');
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
      {/* 1. Header Bar */}
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
            <Clock size={15} color="#E8414A" />
            <Text style={styles.logTimeHeaderText}>Log</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.scheduleHeaderBtn}
            onPress={() => {
              setScheduleTaskId(null);
              setScheduleTitle('');
              setScheduleModalOpen(true);
            }}
          >
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.scheduleHeaderText}>Schedule</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/voice-call')}
            style={styles.voiceBtn}
          >
            <Mic size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. View Mode Tabs (Day | Week | Agenda) */}
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

      {/* 3. Date Navigation & Today Switcher */}
      <View style={styles.dateNavRow}>
        <View style={styles.navArrows}>
          <TouchableOpacity onPress={handlePrevDay} style={styles.arrowBtn}>
            <ChevronLeft size={18} color="#ccc" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleToday} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNextDay} style={styles.arrowBtn}>
            <ChevronRight size={18} color="#ccc" />
          </TouchableOpacity>
        </View>

        <Text style={styles.dateTitleText}>
          {new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      </View>

      {/* 4. 7-Day Week Strip */}
      <View style={styles.weekStrip}>
        {weekDays.map((d) => (
          <TouchableOpacity
            key={d.dateStr}
            style={[
              styles.weekDayPill,
              d.isSelected && styles.weekDayPillSelected,
              d.isToday && !d.isSelected && styles.weekDayPillToday,
            ]}
            onPress={() => setSelectedDate(d.dateStr)}
          >
            <Text
              style={[
                styles.weekDayName,
                d.isSelected && styles.weekDayTextActive,
                d.isToday && !d.isSelected && styles.weekDayTextToday,
              ]}
            >
              {d.name}
            </Text>
            <Text
              style={[
                styles.weekDayNum,
                d.isSelected && styles.weekDayTextActive,
                d.isToday && !d.isSelected && styles.weekDayTextToday,
              ]}
            >
              {d.dayNum}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 5. Summary Metrics Bar */}
      {projection && (
        <View style={styles.metricsBar}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Planned focus</Text>
            <Text style={styles.metricValue}>
              {Math.floor((projection.summary.totalPlannedMinutes || 0) / 60)}h{' '}
              {(projection.summary.totalPlannedMinutes || 0) % 60}m
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Time spent</Text>
            <Text style={[styles.metricValue, { color: '#E8414A' }]}>
              {Math.floor((projection.summary.totalActualMinutes || 0) / 60)}h{' '}
              {(projection.summary.totalActualMinutes || 0) % 60}m
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Completed</Text>
            <Text style={[styles.metricValue, { color: '#10B981' }]}>
              {projection.summary.completedOccurrencesCount || 0}
            </Text>
          </View>
        </View>
      )}

      {/* 6. Main Calendar Content Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color="#E8414A" size="large" />
          <Text style={styles.loadingText}>Loading timeline...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {/* DAY VIEW: 24-Hour Timeline Grid */}
          {(viewMode === 'day' || viewMode === 'week') && (
            <View style={styles.timelineContainer}>
              {/* Hour Grid Lines (00:00 to 24:00) */}
              {Array.from({ length: 24 }).map((_, h) => (
                <TouchableOpacity
                  key={`hour-${h}`}
                  style={[styles.hourRow, { top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }]}
                  activeOpacity={0.6}
                  onPress={() => {
                    setScheduleHour(h);
                    setScheduleTaskId(null);
                    setScheduleTitle('');
                    setScheduleModalOpen(true);
                  }}
                >
                  <View style={styles.timeLabelContainer}>
                    <Text style={styles.timeLabelText}>{formatHourLabel(h)}</Text>
                  </View>
                  <View style={styles.hourDividerLine} />
                </TouchableOpacity>
              ))}

              {/* Current Time Indicator (Red line) */}
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
                const isCompleted = block.variance.status === 'ON_TRACK' || !!block.actual;

                let borderLeftColor = '#E8414A';
                if (isHard) borderLeftColor = '#EF4444';
                else if (isRoutine) borderLeftColor = '#F59E0B';
                else if (isCompleted) borderLeftColor = '#10B981';

                return (
                  <TouchableOpacity
                    key={block.blockId}
                    activeOpacity={0.8}
                    onPress={() => setSelectedBlock(block)}
                    style={[
                      styles.dayBlockCard,
                      {
                        top: topPos,
                        height: blockHeight,
                        borderLeftColor: borderLeftColor,
                      },
                    ]}
                  >
                    <View style={styles.dayBlockHeader}>
                      <Text style={styles.dayBlockTitle} numberOfLines={1}>
                        {block.title}
                      </Text>
                      {isCompleted && <CheckCircle2 size={12} color="#10B981" />}
                    </View>

                    {block.planned && blockHeight >= 40 && (
                      <Text style={styles.dayBlockTimeText} numberOfLines={1}>
                        {formatMinutes(block.planned.startMinute)} – {formatMinutes(block.planned.endMinute)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* AGENDA VIEW: Chronological List */}
          {viewMode === 'agenda' && (
            <View style={styles.agendaContainer}>
              {projection?.blocks.length === 0 ? (
                <View style={styles.centerContainer}>
                  <CalendarIcon size={36} color="#444" />
                  <Text style={styles.emptyTitle}>No scheduled events</Text>
                  <Text style={styles.emptySubtitle}>Tap + Schedule to plan your work</Text>
                </View>
              ) : (
                projection?.blocks.map((block) => {
                  const isHard = block.kind === 'HARD_EVENT';
                  const isRoutine = block.kind === 'ROUTINE_BLOCK';
                  const isDone = !!block.actual || block.variance.status === 'ON_TRACK';

                  return (
                    <TouchableOpacity
                      key={block.blockId}
                      style={[
                        styles.agendaCard,
                        isHard && styles.hardCard,
                        isRoutine && styles.routineCard,
                      ]}
                      onPress={() => setSelectedBlock(block)}
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
                              {formatMinutes(block.planned.startMinute)} – {formatMinutes(block.planned.endMinute)} ({block.planned.durationMinutes}m)
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

          {/* 7. Tasks to Schedule Tray */}
          {projection?.tasksToSchedule && projection.tasksToSchedule.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleRow}>
                  <ListTodo size={16} color="#E8414A" />
                  <Text style={styles.sectionTitle}>Tasks to schedule</Text>
                </View>
                <Text style={styles.sectionBadge}>{projection.tasksToSchedule.length}</Text>
              </View>

              {projection.tasksToSchedule.map((task) => (
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

          {/* 8. Aven's RoutineAI Suggestion */}
          <View style={styles.avenSuggestionCard}>
            <View style={styles.avenHeaderRow}>
              <Sparkles size={16} color="#E8414A" />
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

      {/* 9. SCHEDULE TASK MODAL */}
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
              placeholder="e.g. Design review, Deep work"
              placeholderTextColor="#666"
              value={scheduleTitle}
              onChangeText={setScheduleTitle}
            />

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
                <Text style={styles.primaryModalBtnText}>Schedule into Day</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 10. BLOCK ACTIONS / RESCHEDULE MODAL */}
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

      {/* 11. LOG TIME MODAL */}
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
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subTitle: {
    color: '#8A8F9D',
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logTimeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2129',
    borderColor: '#2F333D',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 5,
  },
  logTimeHeaderText: {
    color: '#E1E4EA',
    fontSize: 12,
    fontWeight: '600',
  },
  scheduleHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8414A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 5,
  },
  scheduleHeaderText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  voiceBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#262933',
    borderColor: '#373C48',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#161922',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  viewTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 9,
  },
  viewTabActive: {
    backgroundColor: '#262A36',
  },
  viewTabText: {
    color: '#8E94A4',
    fontSize: 12,
    fontWeight: '600',
  },
  viewTabTextActive: {
    color: '#FFFFFF',
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
    gap: 6,
  },
  arrowBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1C1F28',
    borderWidth: 1,
    borderColor: '#2B2F3D',
  },
  todayBtn: {
    backgroundColor: '#E8414A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  todayBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dateTitleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  weekDayPill: {
    width: (SCREEN_WIDTH - 32 - 24) / 7,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#262A34',
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
    marginBottom: 2,
  },
  weekDayNum: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  weekDayTextActive: {
    color: '#FFFFFF',
  },
  weekDayTextToday: {
    color: '#E8414A',
  },
  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#161922',
    marginHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242834',
    marginBottom: 10,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    color: '#7D8494',
    fontSize: 10,
    fontWeight: '500',
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  metricDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#2A2F3D',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
    marginTop: 12,
  },
  emptyTitle: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  mainScrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  timelineContainer: {
    height: 24 * HOUR_HEIGHT,
    position: 'relative',
    backgroundColor: '#12141B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#20242F',
    overflow: 'hidden',
    marginBottom: 16,
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeLabelContainer: {
    width: 60,
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
    left: 56,
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
    left: 64,
    right: 8,
    backgroundColor: '#26282E',
    borderColor: '#3E424B',
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    fontWeight: '500',
    marginTop: 1,
  },
  agendaContainer: {
    gap: 8,
    marginBottom: 16,
  },
  agendaCard: {
    backgroundColor: '#181B24',
    borderRadius: 14,
    padding: 14,
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
    gap: 12,
    flex: 1,
  },
  agendaIndicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  agendaTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  agendaTime: {
    color: '#8E94A4',
    fontSize: 11,
    marginTop: 3,
  },
  agendaActual: {
    color: '#10B981',
    fontSize: 11,
    marginTop: 2,
  },
  agendaCardRight: {
    marginLeft: 8,
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  doneBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  rescheduleQuickBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#222633',
  },
  sectionCard: {
    backgroundColor: '#161922',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#242834',
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionBadge: {
    color: '#8A8F9D',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: '#20242F',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  unscheduledTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#20242F',
  },
  unscheduledTaskTitle: {
    color: '#E1E4EA',
    fontSize: 12,
    fontWeight: '600',
  },
  unscheduledTaskMeta: {
    color: '#73798A',
    fontSize: 10,
    marginTop: 2,
  },
  taskScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 65, 74, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
    marginLeft: 8,
  },
  taskScheduleBtnText: {
    color: '#E8414A',
    fontSize: 11,
    fontWeight: '700',
  },
  avenSuggestionCard: {
    backgroundColor: '#171A24',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#292E3D',
    marginBottom: 20,
  },
  avenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  avenTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  avenDesc: {
    color: '#8E94A4',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },
  avenActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8414A',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  avenActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#161922',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#282C38',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalSubTitle: {
    color: '#8E94A4',
    fontSize: 11,
    marginTop: 2,
  },
  inputLabel: {
    color: '#8E94A4',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#1F232D',
    borderColor: '#2B303E',
    borderWidth: 1,
    borderRadius: 10,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  timeChipsScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
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
    fontSize: 11,
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  durationsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
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
    fontSize: 11,
    fontWeight: '600',
  },
  durationBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  primaryModalBtn: {
    backgroundColor: '#E8414A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryModalBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  actionSectionTitle: {
    color: '#8E94A4',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  rescheduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  rescheduleBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#20242F',
    borderColor: '#2B303E',
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  rescheduleBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  completeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  completeActionBtnText: {
    color: '#10B981',
    fontSize: 13,
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
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  logTimeActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
