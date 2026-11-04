"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined
);

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("kmegle_theme");

    if (savedTheme === "light") {
      setIsDarkMode(false);
    } else if (savedTheme === "dark") {
      setIsDarkMode(true);
    } else {
      setIsDarkMode(
        window.matchMedia("(prefers-color-scheme: dark)").matches
      );
    }

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    localStorage.setItem(
      "kmegle_theme",
      isDarkMode ? "dark" : "light"
    );

    document.documentElement.classList.toggle(
      "dark",
      isDarkMode
    );

    // Keep the browser chrome color in sync with the active theme.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", isDarkMode ? "#221C16" : "#F7F2EA");
  }, [isDarkMode, mounted]);

  const toggleDarkMode = () => {
    setIsDarkMode((current) => !current);
  };

  return (
    <ThemeContext.Provider
      value={{
        isDarkMode,
        toggleDarkMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      "useTheme must be used inside ThemeProvider"
    );
  }

  return context;
}
