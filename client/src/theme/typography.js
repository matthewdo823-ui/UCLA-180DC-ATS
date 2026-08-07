import { css } from "./colors";

// Centralized type system.
// DM Sans is the single family for all UI text and headings; DM Mono is used
// only for numeric / tabular values. Weights are limited to those actually
// loaded in index.html (400/500/600/700) so nothing renders as a synthesized
// faux-bold.
export const sansFont = "'DM Sans', sans-serif";
export const monoFont = "'DM Mono', monospace";

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

// Page-level heading (h1).
export const pageTitleStyle = {
  fontFamily: sansFont,
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: 1.2,
  color: css.textDark,
  margin: 0,
};

// Small uppercase panel / section label.
export const sectionTitleStyle = {
  fontFamily: sansFont,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: css.textGray,
  margin: 0,
};

// Default body copy.
export const bodyStyle = {
  fontFamily: sansFont,
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 1.5,
  color: css.textDark,
};

// Secondary / caption text.
export const captionStyle = {
  fontFamily: sansFont,
  fontSize: 12,
  fontWeight: 500,
  color: css.textGray,
};

// Numeric / tabular values.
export const monoStyle = {
  fontFamily: monoFont,
  fontWeight: 500,
};
