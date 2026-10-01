import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { THEME_KEY } from "../constants/storageKeys.js";

const ThemeContext = createContext({
  theme: "dark",
  toggleTheme: () => {},
});

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const value = useMemo(
    () => ({ theme, toggleTheme }),
    [theme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
