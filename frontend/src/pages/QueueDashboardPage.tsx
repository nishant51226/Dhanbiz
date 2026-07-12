import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import { fetchPgBossDashboard } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageLayout } from "../components/admin/PageLayout";
import { JobStatusChip } from "../components/admin/JobStatusChip";
import type { PgBossDashboard, PgBossQueueJobRow } from "../types/api";
import { formatDateTime } from "../utils/formatDate";

function stateChipColor(state: string): "default" | "primary" | "warning" | "success" | "error" {
  if (state === "active") return "primary";
  if (state === "created") return "default";
  if (state === "retry") return "warning";
  if (state === "completed") return "success";
  if (state === "failed" || state === "cancelled") return "error";
  return "default";
}

function payloadSummary(row: PgBossQueueJobRow): string {
  const p = row.payload;
  if (row.jobId) return `job ${row.jobId.slice(0, 8)}…`;
  if (typeof p.jobId === "string") return `job ${p.jobId.slice(0, 8)}…`;
  if (typeof p.customerId === "string") return `customer ${p.customerId.slice(0, 8)}…`;
  if (typeof p.exportId === "string") return `export ${p.exportId.slice(0, 8)}…`;
  return "—";
}

function JobsTable({ rows, showCompleted }: { rows: PgBossQueueJobRow[]; showCompleted?: boolean }) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
        No jobs in this view.
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Queue</TableCell>
            <TableCell>pg-boss state</TableCell>
            <TableCell>Payload</TableCell>
            <TableCell>Document</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>DB status</TableCell>
            <TableCell align="right">%</TableCell>
            <TableCell>{showCompleted ? "Completed" : "Created"}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.queueName}-${row.pgBossId}`} hover>
              <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{row.queueName}</TableCell>
              <TableCell>
                <Chip size="small" label={row.state} color={stateChipColor(row.state)} variant="outlined" />
              </TableCell>
              <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{payloadSummary(row)}</TableCell>
              <TableCell>{row.documentName ?? "—"}</TableCell>
              <TableCell>{row.customerName ?? "—"}</TableCell>
              <TableCell>
                {row.jobStatus ? <JobStatusChip status={row.jobStatus as never} /> : "—"}
              </TableCell>
              <TableCell align="right">{row.percentCompleted ?? "—"}</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap", fontSize: 12 }}>
                {formatDateTime(showCompleted ? row.completedOn ?? row.createdOn : row.createdOn)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function QueueDashboardPage() {
  const { apiBase, authHeaders } = useAuth();
  const location = useLocation();
  const inSettings = location.pathname.startsWith("/settings/queue");
  const [data, setData] = useState<PgBossDashboard | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  const load = useCallback(async () => {
    try {
      const dash = await fetchPgBossDashboard(apiBase, authHeaders());
      setData(dash);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load queue dashboard");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(t);
  }, [load]);

  const summaryByQueue = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, Record<string, number>>();
    for (const row of data.stateCounts) {
      const cur = map.get(row.queueName) ?? {};
      cur[row.state] = row.count;
      map.set(row.queueName, cur);
    }
    return data.queueNames.map((name) => ({
      name,
      states: map.get(name) ?? {},
    }));
  }, [data]);

  return (
    <PageLayout
      embedded={inSettings}
      title="Queue"
      subtitle="pg-boss — live Postgres-backed job queue (waiting, running, or stuck messages)."
      actions={
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={<RefreshOutlined />} onClick={() => void load()}>
            Refresh
          </Button>
        </Box>
      }
    >
      {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
      {!data && loading ? (
        <Typography color="text.secondary">Loading queue state…</Typography>
      ) : null}
      {data ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
            <Chip
              label={data.workerRunning ? "Worker running" : "Worker not started"}
              color={data.workerRunning ? "success" : "error"}
              variant="outlined"
            />
            <Typography variant="caption" color="text.secondary">
              Updated {formatDateTime(data.fetchedAt)}
            </Typography>
          </Box>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
              Queue summary
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Queue</TableCell>
                    <TableCell align="right">created</TableCell>
                    <TableCell align="right">active</TableCell>
                    <TableCell align="right">retry</TableCell>
                    <TableCell align="right">completed</TableCell>
                    <TableCell align="right">failed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summaryByQueue.map((q) => (
                    <TableRow key={q.name}>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 13 }}>{q.name}</TableCell>
                      <TableCell align="right">{q.states.created ?? 0}</TableCell>
                      <TableCell align="right">{q.states.active ?? 0}</TableCell>
                      <TableCell align="right">{q.states.retry ?? 0}</TableCell>
                      <TableCell align="right">{q.states.completed ?? 0}</TableCell>
                      <TableCell align="right">{q.states.failed ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {data.mismatches.length > 0 ? (
            <Alert severity="warning">
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                DB ↔ pg-boss mismatches ({data.mismatches.length})
              </Typography>
              {data.mismatches.map((m) => (
                <Box key={m.jobId} sx={{ fontSize: 13, mb: 0.5 }}>
                  <Link component={RouterLink} to={`/jobs/${m.jobId}`} underline="hover">
                    {m.jobId.slice(0, 8)}…
                  </Link>
                  {" — "}
                  status={m.jobStatus} ({m.issue})
                </Box>
              ))}
            </Alert>
          ) : null}

          <Paper variant="outlined">
            <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: "divider" }}>
              <Tab label={`Live (${data.liveJobs.length})`} />
              <Tab label={`Recent 1h (${data.recentCompleted.length})`} />
            </Tabs>
            <Box sx={{ p: 2 }}>
              {tab === 0 ? <JobsTable rows={data.liveJobs} /> : null}
              {tab === 1 ? <JobsTable rows={data.recentCompleted} showCompleted /> : null}
            </Box>
          </Paper>
        </Box>
      ) : null}
    </PageLayout>
  );
}
