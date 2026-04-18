import { createPortal } from "react-dom";
import type { LayoutMode } from "../layout/types.js";
import VideoGrid from "./VideoGrid";
import { useEffect, useState } from "react";

export default function PipContent({ pipWindow, layoutMode }: { pipWindow: Window; layoutMode?: LayoutMode }) {
  const [size, setSize] = useState({ width: pipWindow.innerWidth, height: pipWindow.innerHeight });

  useEffect(() => {
    const measure = () => setSize({ width: pipWindow.innerWidth, height: pipWindow.innerHeight });
    measure();
    pipWindow.addEventListener("resize", measure);
    return () => pipWindow.removeEventListener("resize", measure);
  }, [pipWindow]);

  return createPortal(
    <div className="pip-content">
      <VideoGrid
        containerWidth={size.width}
        containerHeight={size.height}
        containerSize={size}
        layoutMode={layoutMode}
      />
    </div>,
    pipWindow.document.body,
  );
}
