"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
const ThemeContext = createContext<
  { isDarkMode: boolean; toggleDarkMode: () => void } | undefined
>(undefined);
function snapshot() {
  try {
    const saved = localStorage.getItem("kmegle_theme");
    return (
      saved === "dark" ||
      (saved !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)
    );
  } catch {
    return false;
  }
}
function subscribe(callback: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", callback);
  window.addEventListener("kmegle-theme", callback);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("kmegle-theme", callback);
    media.removeEventListener("change", callback);
  };
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const isDarkMode = useSyncExternalStore(subscribe, snapshot, () => false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", isDarkMode ? "#0a0a0f" : "#f8fafc");
  }, [isDarkMode]);
  const toggleDarkMode = () => {
    try {
      localStorage.setItem("kmegle_theme", isDarkMode ? "light" : "dark");
    } catch {}
    window.dispatchEvent(new Event("kmegle-theme"));
  };
  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
