import { alpha } from "@mui/material/styles";
import { Box, Button, InputBase } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

type PageActionsProps = {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  /** When omitted, the add button is hidden. */
  addLabel?: string;
  onAdd?: () => void;
};

export function PageActions({
  search,
  onSearch,
  placeholder = "Search…",
  addLabel,
  onAdd,
}: PageActionsProps) {
  const showAdd = Boolean(addLabel?.trim() && onAdd);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Box
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.5,
          height: 36,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1.5,
          width: 220,
          transition: "border-color 0.15s, box-shadow 0.15s",
          "&:focus-within": {
            borderColor: "primary.main",
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.35 : 0.12)}`,
          },
        })}
      >
        <SearchOutlined sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }} />
        <InputBase
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          sx={{
            fontSize: 13,
            flex: 1,
            "& input": { p: 0, "&::placeholder": { color: "text.disabled", opacity: 1 } },
          }}
        />
      </Box>
      {showAdd ? (
        <Button
          variant="contained"
          color="primary"
          size="small"
          startIcon={<AddOutlined sx={{ fontSize: 16 }} />}
          disableElevation
          onClick={onAdd}
          sx={{
            fontWeight: 600,
            fontSize: 13,
            height: 36,
            px: 2,
            borderRadius: 1.5,
            whiteSpace: "nowrap",
          }}
        >
          {addLabel}
        </Button>
      ) : null}
    </Box>
  );
}
