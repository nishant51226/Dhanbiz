import { useEffect, useRef } from "react";
import { Box } from "@mui/material";

type ExplorerScrollSentinelProps = {
  onVisible: () => void;
  disabled?: boolean;
};

/** Triggers `onVisible` when scrolled into view (infinite scroll helper). */
export function ExplorerScrollSentinel({ onVisible, disabled = false }: ExplorerScrollSentinelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisible();
      },
      { rootMargin: "120px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible, disabled]);
  return <Box ref={ref} sx={{ height: 1, flexShrink: 0 }} aria-hidden />;
}
