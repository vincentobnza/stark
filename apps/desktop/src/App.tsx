import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ApprovalPrompt } from "./components/ApprovalPrompt";
import { Controls } from "./components/Controls";
import { Orb } from "./components/Orb";
import { Waveform } from "./components/Waveform";
import { BootSequence } from "./components/BootSequence";
import { useStark } from "./state/store";
import { useStarkSession } from "./useStarkSession";

const HINT: Record<string, string> = {
  idle: "just speak",
  listening: "listening",
  transcribing: "transcribing",
  thinking: "thinking",
  awaiting: "awaiting approval",
  speaking: "speaking",
};

/** Corner brackets. Cheap way to read as an instrument panel, not a chat card. */
function Corners() {
  const edge = "pointer-events-none absolute size-3 border-white/20";
  return (
    <>
      <div className={`${edge} top-0 left-0 border-t border-l`} />
      <div className={`${edge} top-0 right-0 border-t border-r`} />
      <div className={`${edge} bottom-0 left-0 border-b border-l`} />
      <div className={`${edge} bottom-0 right-0 border-b border-r`} />
    </>
  );
}

export default function App() {
  const { status, caption, streaming, error, pending } = useStark();
  const {
    interrupt,
    interruptible,
    micOpen,
    level,
    bootSteps,
    bootDone,
    dismissBoot,
  } = useStarkSession();

  // No push-to-talk any more; speech starts a turn on its own. These keys only
  // cut the assistant off mid-sentence.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The approval prompt owns Enter and Escape while it is open.
      if (pending || !interruptible) return;
      if (e.key !== "Enter" && e.key !== "Escape") return;
      e.preventDefault();
      interrupt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interrupt, interruptible, pending]);

  const line = streaming || caption?.text || "";
  const kind = streaming ? "said" : caption?.kind;
  const prefix = kind === "heard" ? "> " : kind === "tool" ? "$ " : "";

  return (
    <div className="relative h-full w-full overflow-hidden border border-white/12 bg-[#0b0b0d]">
      {/* Backdrop doubles as the drag handle — there is no title bar. */}
      <div
        data-tauri-drag-region
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 40%, #18181b 0%, #0d0d0f 48%, #050506 100%)",
        }}
      />

      <Corners />
      <Controls />

      {/* pb leaves the waveform its own band at the bottom. */}
      <div className="group relative flex h-full flex-col items-center justify-center pb-20">
        {/* Display only. Nothing here is clickable. */}
        <div className="pointer-events-none size-64 shrink-0">
          <Orb status={status} level={level} armed={micOpen} />
        </div>

        {/* One transient line. Replaced, never accumulated. */}
        <div className="flex h-16 w-full items-start justify-center px-6 pt-1">
          <AnimatePresence mode="wait">
            <motion.p
              key={`${kind}-${line.slice(0, 24)}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`line-clamp-2 text-center text-[12px] leading-relaxed ${
                kind === "tool"
                  ? "text-[11px] tracking-wide text-teal-300/70"
                  : kind === "heard"
                    ? "text-white/35"
                    : "text-white/85"
              }`}
            >
              {line ? (
                <>
                  <span className="text-white/25">{prefix}</span>
                  {line}
                </>
              ) : (
                <span className="text-[10px] tracking-tight text-white/25 uppercase">
                  {HINT[status]}
                </span>
              )}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <Waveform level={level} active={micOpen} />

      {error && (
        <p className="selectable absolute inset-x-2 bottom-20 z-20 border border-red-500/25 bg-red-500/10 px-2 py-1.5 text-center text-[9px] leading-snug break-words text-red-300/90">
          {error}
        </p>
      )}

      <BootSequence steps={bootSteps} done={bootDone} onDismiss={dismissBoot} />

      <ApprovalPrompt />
    </div>
  );
}
