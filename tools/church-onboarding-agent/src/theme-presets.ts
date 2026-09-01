import type { BrandProfile, ResolvedBrandProfile, StyleTheme } from "./types";

export const STYLE_THEME_OPTIONS: Array<[string, StyleTheme]> = [
  ["Contemporary", "contemporary"],
  ["Traditional", "traditional"],
  ["Modern", "modern"],
  ["Editorial", "editorial"],
];

export function applyStyleTheme(theme: StyleTheme, current: ResolvedBrandProfile): BrandProfile {
  const common = { styleTheme: theme } as BrandProfile;
  switch (theme) {
    case "traditional":
      return {
        ...common,
        headingFont: "Georgia, 'Times New Roman', serif",
        bodyFont: "'Palatino Linotype', Palatino, Georgia, serif",
        headingWeight: "700",
        headingTransform: "none",
        cornerRadius: "2px",
        buttonStyle: "square",
        headerStyle: "plain",
        logoPosition: "left",
        cardStyle: "bordered",
        pageWidth: "760px",
        pagePadding: "54px",
        sectionSpacing: "28px",
      };
    case "modern":
      return {
        ...common,
        headingFont: "Inter, Arial, sans-serif",
        bodyFont: "Inter, Arial, sans-serif",
        headingWeight: "800",
        headingTransform: "uppercase",
        cornerRadius: "0px",
        buttonStyle: "square",
        headerStyle: "split",
        logoPosition: "right",
        cardStyle: "flat",
        pageWidth: "840px",
        pagePadding: "56px",
        sectionSpacing: "38px",
      };
    case "editorial":
      return {
        ...common,
        headingFont: "Inter, Arial, sans-serif",
        bodyFont: "Georgia, 'Times New Roman', serif",
        headingWeight: "800",
        headingTransform: "none",
        cornerRadius: "0px",
        buttonStyle: "square",
        headerStyle: "plain",
        logoPosition: "right",
        cardStyle: "bordered",
        pageWidth: "820px",
        pagePadding: "50px",
        sectionSpacing: "34px",
      };
    case "contemporary":
    default:
      return {
        ...common,
        headingFont: current.headingFont || "'Avenir Next', 'Helvetica Neue', Arial, sans-serif",
        bodyFont: current.bodyFont || "Arial, Helvetica, sans-serif",
        headingWeight: "800",
        headingTransform: "uppercase",
        cornerRadius: "12px",
        buttonStyle: "soft",
        headerStyle: "filled",
        logoPosition: "right",
        cardStyle: "soft",
        pageWidth: "800px",
        pagePadding: "52px",
        sectionSpacing: "30px",
      };
  }
}
