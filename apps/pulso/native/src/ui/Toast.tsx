import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useRailMetrics } from "@/shell/metrics";
import { useTheme } from "@/theme";
import { haptics } from "./haptics";
import { Icon, type SFSymbol } from "./Icon";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";

type ToastInput = {
  message: string;
  /** Shows «Deshacer»; called once if tapped before the toast leaves. */
  undo?: () => void | Promise<unknown>;
  icon?: SFSymbol;
  tone?: "default" | "error";
  /** ms; motion.toast by default. */
  duration?: number;
};

type ToastState = ToastInput & { id: number };

const ToastContext = createContext<{ show(t: ToastInput): void; hide(): void }>({ show: () => undefined, hide: () => undefined });

/** `const toast = useToast(); toast.show({ message: "Vitamina D tomada", undo: () => undo(id) })`. */
export const useToast = () => useContext(ToastContext);

/** Holds the one toast on screen; mount once at the root, above the tabs. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const seq = useRef(0);
  const show = useCallback((t: ToastInput) => {
    if (t.tone === "error") haptics.error();
    setToast({ ...t, id: ++seq.current });
  }, []);
  const hide = useCallback(() => setToast(null), []);
  const value = useMemo(() => ({ show, hide }), [show, hide]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDone={hide} onUndoFailed={(message) => show({ message, tone: "error" })} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDone, onUndoFailed }: { toast: ToastState; onDone: () => void; onUndoFailed: (message: string) => void }) {
  const { colors, motion } = useTheme();
  const rail = useRailMetrics();
  const used = useRef(false);
  useEffect(() => {
    const t = setTimeout(onDone, toast.duration ?? motion.toast);
    return () => clearTimeout(t);
  }, [toast, onDone, motion.toast]);
  const error = toast.tone === "error";
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: rail.side, right: rail.side, bottom: rail.bottom + rail.height + 10 }}>
      <Animated.View
        entering={FadeInDown.springify().damping(motion.sheet.damping).stiffness(motion.sheet.stiffness)}
        exiting={FadeOutDown.duration(motion.fast)}
        accessibilityLiveRegion="polite"
        style={{
          minHeight: 52,
          borderRadius: 14,
          backgroundColor: colors.rail,
          borderWidth: 1,
          borderColor: error ? colors.negative : colors.railBorder,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 14,
          paddingRight: 6,
          gap: 10,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <Icon name={toast.icon ?? (error ? "exclamationmark.triangle.fill" : "checkmark")} size={15} tint={error ? colors.negative : colors.accent} />
        <Text variant="subhead" style={{ flex: 1, color: "#E9EEF0", paddingVertical: 10 }} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.undo ? (
          <PressableScale
            testID="toast-undo"
            onPress={() => {
              if (used.current) return;
              used.current = true;
              onDone();
              Promise.resolve()
                .then(() => toast.undo?.())
                .then(() => haptics.tap())
                .catch((e: unknown) => onUndoFailed(e instanceof Error ? e.message : "No se pudo deshacer."));
            }}
            style={{ height: 40, paddingHorizontal: 12, borderRadius: 9, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
          >
            <Text variant="button" color="onAccent" style={{ fontSize: 12 }}>
              Deshacer
            </Text>
          </PressableScale>
        ) : null}
      </Animated.View>
    </View>
  );
}
