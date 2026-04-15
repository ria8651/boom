import { useCallback, useEffect, useRef, useState } from "react";

function cloneStyles(pipWindow: Window) {
  for (const sheet of document.styleSheets) {
    try {
      const rules = [...sheet.cssRules].map((r) => r.cssText).join("\n");
      const style = pipWindow.document.createElement("style");
      style.textContent = rules;
      pipWindow.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = pipWindow.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        pipWindow.document.head.appendChild(link);
      }
    }
  }
}

export function usePictureInPicture() {
  const isSupported =
    typeof window !== "undefined" && "documentPictureInPicture" in window;

  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipRef = useRef<Window | null>(null);

  const open = useCallback(async () => {
    if (!isSupported || pipRef.current) return;

    try {
      const pip = await window.documentPictureInPicture!.requestWindow({
        width: 400,
        height: 300,
      });

      cloneStyles(pip);
      pip.document.body.style.margin = "0";
      pip.document.body.style.overflow = "hidden";
      pip.document.body.style.background = "rgb(34, 34, 34)";
      pip.document.body.style.fontFamily =
        '"Open Sans", system-ui, -apple-system, sans-serif';

      pip.addEventListener("pagehide", () => {
        pipRef.current = null;
        setPipWindow(null);
      });

      pipRef.current = pip;
      setPipWindow(pip);
    } catch {
      // Browser blocked — needs user gesture
    }
  }, [isSupported]);

  const close = useCallback(() => {
    if (pipRef.current) {
      pipRef.current.close();
      pipRef.current = null;
      setPipWindow(null);
    }
  }, []);

  // Close PiP window on unmount (leaving the room)
  useEffect(() => {
    return () => {
      pipRef.current?.close();
      pipRef.current = null;
    };
  }, []);

  return { isSupported, isActive: pipWindow != null, pipWindow, open, close };
}
