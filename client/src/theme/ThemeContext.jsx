import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const ThemeContext = createContext(null);
const storageKey = "resume-screener-theme-v2";
const lightOnlyPaths = new Set(["/login", "/forgot-password", "/reset-password"]);

function getInitialTheme() {
  const savedTheme = localStorage.getItem(storageKey);
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;

  return "light";
}

export function ThemeProvider({ children }) {
  const location = useLocation();
  const [theme, setTheme] = useState(getInitialTheme);
  const appliedTheme = lightOnlyPaths.has(location.pathname) ? "light" : theme;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = appliedTheme;
    document.documentElement.style.colorScheme = appliedTheme;
  }, [appliedTheme]);

  useEffect(() => {
    localStorage.setItem(storageKey, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((currentTheme) => (
    currentTheme === "dark" ? "light" : "dark"
  ));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
