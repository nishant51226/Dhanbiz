export type PgBossQueueStateCount = {
  queueName: string;
  state: string;
  count: number;
};

export type PgBossQueueJobRow = {
  pgBossId: string;
  queueName: string;
  state: string;
  createdOn: string;
  startedOn: string | null;
  completedOn: string | null;
  payload: Record<string, unknown>;
  jobId: string | null;
  jobStatus: string | null;
  percentCompleted: number | null;
  documentName: string | null;
  customerName: string | null;
};

export type PgBossJobMismatch = {
  jobId: string;
  jobStatus: string;
  percentCompleted: number;
  pgBossJobId: string | null;
  issue: string;
};

export type QueueDashboardResponse = {
  workerRunning: boolean;
  queueNames: string[];
  stateCounts: PgBossQueueStateCount[];
  /** Jobs waiting to run or currently running in pg-boss. */
  liveJobs: PgBossQueueJobRow[];
  /** Recently finished pg-boss messages (last hour). */
  recentCompleted: PgBossQueueJobRow[];
  mismatches: PgBossJobMismatch[];
  fetchedAt: string;
};
