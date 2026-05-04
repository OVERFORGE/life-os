import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { Animated, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react-native';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastConfig {
  message?: string;
  title?: string;
  type?: ToastType;
  duration?: number;
  action?: { label: string; onPress: () => void };
}

interface ToastContextValue {
  show: (config: ToastConfig) => void;
  success: (title: string, message?: string, action?: ToastConfig['action']) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_COLORS: Record<ToastType, { border: string; icon: string; bg: string }> = {
  success: { border: '#10b981', icon: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  error:   { border: '#ef4444', icon: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  warning: { border: '#f59e0b', icon: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  info:    { border: '#6366f1', icon: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
};

const ICONS: Record<ToastType, React.ComponentType<any>> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

interface ToastItem extends ToastConfig {
  id: number;
  type: ToastType;
}

const { width: SCREEN_W } = Dimensions.get('window');

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const slideY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => dismiss(), item.duration ?? 3500);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: -120, duration: 280, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  const colors = TOAST_COLORS[item.type];
  const Icon = ICONS[item.type];

  return (
    <Animated.View
      style={{
        transform: [{ translateY: slideY }],
        opacity,
        marginHorizontal: 16,
        marginBottom: 8,
        backgroundColor: '#161922',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border + '60',
        borderLeftWidth: 3,
        borderLeftColor: colors.border,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 16,
      }}
    >
      <View style={{ marginRight: 12, marginTop: 1 }}>
        <Icon color={colors.icon} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        {item.title && (
          <Text style={{ color: '#f3f4f6', fontWeight: '700', fontSize: 14, marginBottom: item.message ? 3 : 0 }}>
            {item.title}
          </Text>
        )}
        {item.message ? (
          <Text style={{ color: '#9ca3af', fontSize: 13, lineHeight: 18 }}>{item.message}</Text>
        ) : null}
        {item.action && (
          <TouchableOpacity onPress={() => { item.action!.onPress(); dismiss(); }} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.icon, fontWeight: '700', fontSize: 12 }}>{item.action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity onPress={dismiss} style={{ padding: 2, marginLeft: 8 }}>
        <X color="#4b5563" size={16} />
      </TouchableOpacity>
    </Animated.View>
  );
}

let toastCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((config: ToastConfig) => {
    const id = ++toastCounter;
    const item: ToastItem = { ...config, id, type: config.type ?? 'info' };
    setToasts(prev => [item, ...prev].slice(0, 3)); // max 3 visible
  }, []);

  const success = useCallback((title: string, message?: string, action?: ToastConfig['action']) =>
    show({ title, message, type: 'success', action }), [show]);
  const error = useCallback((title: string, message?: string) =>
    show({ title, message, type: 'error', duration: 5000 }), [show]);
  const warning = useCallback((title: string, message?: string) =>
    show({ title, message, type: 'warning' }), [show]);
  const info = useCallback((title: string, message?: string) =>
    show({ title, message, type: 'info' }), [show]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info }}>
      {children}
      <View style={{ position: 'absolute', top: 56, left: 0, right: 0, zIndex: 9999, pointerEvents: 'box-none' }}>
        {toasts.map(t => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
