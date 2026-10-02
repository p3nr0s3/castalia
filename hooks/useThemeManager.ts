"use client";

import { useEffect } from "react";
import { ThemeType, FontFamilyType, CustomThemePalette } from "@/lib/types";
import { DEFAULT_CUSTOM_THEME } from "@/lib/constants";

interface UseThemeManagerProps {
  theme: ThemeType;
  fontFamily?: FontFamilyType;
  customTheme?: CustomThemePalette;
}

const CUSTOM_CSS_PROPERTIES = [
  "--background",
  "--foreground",
  "--sidebar-bg",
  "--sidebar-hover",
  "--sidebar-border",
  "--card-bg",
  "--card-border",
  "--accent",
  "--accent-hover",
  "--user-bubble",
  "--input-bg",
  "--input-border",
  "--muted",
  "--header-bg",
];

export function useThemeManager({ theme, fontFamily, customTheme }: UseThemeManagerProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const applySystemTheme = (matchesDark: boolean) => {
        root.removeAttribute("data-theme");
        if (matchesDark) {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
        CUSTOM_CSS_PROPERTIES.forEach((p) => root.style.removeProperty(p));
      };

      applySystemTheme(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => applySystemTheme(e.matches);
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else if (theme === "light") {
      root.setAttribute("data-theme", "light");
      root.classList.remove("dark");
      CUSTOM_CSS_PROPERTIES.forEach((p) => root.style.removeProperty(p));
    } else if (theme === "custom") {
      root.setAttribute("data-theme", "custom");
      root.classList.add("dark");
      const ct = customTheme || DEFAULT_CUSTOM_THEME;
      root.style.setProperty("--background", ct.background);
      root.style.setProperty("--foreground", ct.foreground);
      root.style.setProperty("--sidebar-bg", ct.sidebarBg);
      root.style.setProperty("--sidebar-hover", `${ct.sidebarBg}ee`);
      root.style.setProperty("--sidebar-border", `${ct.cardBg}`);
      root.style.setProperty("--card-bg", ct.cardBg);
      root.style.setProperty("--card-border", `${ct.sidebarBg}`);
      root.style.setProperty("--accent", ct.accent);
      root.style.setProperty("--accent-hover", ct.accent);
      root.style.setProperty("--user-bubble", ct.cardBg);
      root.style.setProperty("--input-bg", ct.cardBg);
      root.style.setProperty("--input-border", `${ct.sidebarBg}`);
      root.style.setProperty("--muted", ct.muted || "#9ca3af");
      root.style.setProperty("--header-bg", `${ct.background}d9`);
    } else {
      root.setAttribute("data-theme", theme);
      root.classList.add("dark");
      CUSTOM_CSS_PROPERTIES.forEach((p) => root.style.removeProperty(p));
    }

    // Apply custom typography font
    root.setAttribute("data-font", fontFamily || "inter");
  }, [theme, fontFamily, customTheme]);
}
