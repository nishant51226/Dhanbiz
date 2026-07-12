import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

type PageLayoutProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  noPadding?: boolean;
  /** Nested inside customer workspace — smaller title, outer padding only on header/content inset. */
  embedded?: boolean;
};

export function PageLayout({
  title,
  subtitle,
  actions,
  children,
  noPadding = false,
  embedded = false,
}: PageLayoutProps) {
  const inset = noPadding || embedded;
  const headerPx = noPadding ? { xs: 2, md: 3 } : embedded ? 0 : 0;
  return (
    <Box sx={{ p: inset && !embedded ? 0 : embedded ? 0 : { xs: 2, md: 3 }, minHeight: "100%" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
          mb: embedded ? 2 : 3,
          px: noPadding ? { xs: 2, md: 3 } : headerPx,
          pt: inset ? { xs: 2, md: embedded ? 2.5 : 3 } : 0,
        }}
      >
        <Box>
          <Typography
            variant={embedded ? "h5" : "h4"}
            component="h1"
            sx={{
              fontFamily: '"Newsreader", Georgia, "Times New Roman", serif',
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions ? (
          <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>{actions}</Box>
        ) : null}
      </Box>
      <Box sx={{ px: noPadding ? { xs: 2, md: 3 } : 0, pb: inset ? { xs: 2, md: embedded ? 2.5 : 3 } : 0 }}>{children}</Box>
    </Box>
  );
}
