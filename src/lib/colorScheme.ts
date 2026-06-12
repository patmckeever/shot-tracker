export type ColorScheme = "light" | "dark";

const COLOR_SCHEME_KEY = "pll_color_scheme";

export function loadColorScheme(): ColorScheme {
  const saved = localStorage.getItem(COLOR_SCHEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

export function persistColorScheme(scheme: ColorScheme): void {
  localStorage.setItem(COLOR_SCHEME_KEY, scheme);
  document.documentElement.setAttribute("data-theme", scheme);
}
