import { env } from "cloudflare:workers";
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "./index";
import { equipments, jobs } from "./schema";
import {
  defaultEquipments,
  Equipment,
  EquipmentCategory,
  EquipmentState,
  getJobEndTime,
  Job,
  JobInput,
  normalizeJobInput,
  Reservation,
} from "@/lib/equipment";

type EquipmentRow = typeof equipments.$inferSelect;
type JobRow = typeof jobs.$inferSelect;

export class RepositoryError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let ensurePromise: Promise<void> | null = null;

function nowIso(now = new Date()) {
  return now.toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function parseCategory(value: unknown): EquipmentCategory {
  if (value === "printing" || value === "sterilization") {
    return value;
  }

  throw new RepositoryError("알 수 없는 장비 탭입니다.");
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    title: row.title,
    team: row.team,
    startTime: row.startTime,
    durationMinutes: row.durationMinutes,
    createdAt: row.createdAt,
  };
}

function derivePersistedStatus(row: EquipmentRow, currentJob: Job | null, reservations: Reservation[]) {
  if (row.status === "maintenance") {
    return "maintenance";
  }

  if (currentJob) {
    return "running";
  }

  if (reservations.length > 0) {
    return "reserved";
  }

  return "idle";
}

function mapState(equipmentRows: EquipmentRow[], jobRows: JobRow[]): EquipmentState {
  const jobsByEquipment = new Map<string, JobRow[]>();

  for (const job of jobRows) {
    const list = jobsByEquipment.get(job.equipmentId) ?? [];
    list.push(job);
    jobsByEquipment.set(job.equipmentId, list);
  }

  const mappedEquipments: Equipment[] = equipmentRows.map((row) => {
    const equipmentJobs = jobsByEquipment.get(row.id) ?? [];
    const currentJobRow = equipmentJobs.find(
      (job) => job.kind === "current" && job.status === "active",
    );
    const reservations = equipmentJobs
      .filter((job) => job.kind === "reservation" && job.status === "scheduled")
      .sort((a, b) => {
        const startDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        return startDiff || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
      .map((job) => ({ ...toJob(job), status: "scheduled" as const }));
    const currentJob = currentJobRow ? toJob(currentJobRow) : null;

    return {
      id: row.id,
      name: row.name,
      category: parseCategory(row.category),
      status: derivePersistedStatus(row, currentJob, reservations),
      currentJob,
      reservations,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  const latestEquipmentUpdate = equipmentRows.reduce(
    (latest, row) => Math.max(latest, new Date(row.updatedAt).getTime()),
    0,
  );
  const latestJobUpdate = jobRows.reduce(
    (latest, row) => Math.max(latest, new Date(row.updatedAt).getTime()),
    0,
  );

  return {
    equipments: mappedEquipments,
    updatedAt: new Date(Math.max(latestEquipmentUpdate, latestJobUpdate, Date.now())).toISOString(),
  };
}

export async function ensureDatabase() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (!env.DB) {
        throw new RepositoryError("D1 DB 바인딩을 찾을 수 없습니다.", 500);
      }

      await env.DB.batch([
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS equipments (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'idle',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            equipment_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            title TEXT NOT NULL,
            team TEXT NOT NULL,
            start_time TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE
          )
        `),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_equipment_status ON jobs (equipment_id, status)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs (equipment_id, kind, status, start_time)"),
      ]);
    })();
  }

  await ensurePromise;
}

async function seedDefaultEquipments() {
  const db = getDb();
  const timestamp = nowIso();

  for (const [index, equipment] of defaultEquipments.entries()) {
    await db
      .insert(equipments)
      .values({
        id: equipment.id,
        name: equipment.name,
        category: equipment.category,
        status: "idle",
        sortOrder: (index + 1) * 10,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing();
  }
}

async function ensureSeeded() {
  await ensureDatabase();

  const db = getDb();
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(equipments);

  if ((row?.count ?? 0) === 0) {
    await seedDefaultEquipments();
  }
}

async function getEquipmentOrThrow(equipmentId: string) {
  const db = getDb();
  const [equipment] = await db.select().from(equipments).where(eq(equipments.id, equipmentId)).limit(1);

  if (!equipment) {
    throw new RepositoryError("장비를 찾을 수 없습니다.", 404);
  }

  return equipment;
}

async function getActiveJob(equipmentId: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.equipmentId, equipmentId), eq(jobs.kind, "current"), eq(jobs.status, "active")))
    .limit(1);

  return job ?? null;
}

async function getScheduledJobs(equipmentId: string) {
  const db = getDb();
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.equipmentId, equipmentId), eq(jobs.kind, "reservation"), eq(jobs.status, "scheduled")))
    .orderBy(asc(jobs.startTime), asc(jobs.createdAt));
}

async function syncEquipmentStatus(equipmentId: string, now = new Date()) {
  const db = getDb();
  const equipment = await getEquipmentOrThrow(equipmentId);

  if (equipment.status === "maintenance") {
    return;
  }

  const activeJob = await getActiveJob(equipmentId);
  const scheduledJobs = await getScheduledJobs(equipmentId);
  const nextStatus = activeJob ? "running" : scheduledJobs.length > 0 ? "reserved" : "idle";

  await db
    .update(equipments)
    .set({ status: nextStatus, updatedAt: nowIso(now) })
    .where(eq(equipments.id, equipmentId));
}

async function reservationCursor(equipmentId: string, now = new Date()) {
  const activeJob = await getActiveJob(equipmentId);

  if (!activeJob) {
    return now;
  }

  return getJobEndTime({
    startTime: activeJob.startTime,
    durationMinutes: activeJob.durationMinutes,
  });
}

async function rebalanceReservations(equipmentId: string, now = new Date()) {
  const db = getDb();
  let cursor = await reservationCursor(equipmentId, now);
  const scheduledJobs = await getScheduledJobs(equipmentId);
  const timestamp = nowIso(now);

  for (const job of scheduledJobs) {
    const startTime = nowIso(cursor);
    cursor = getJobEndTime({
      startTime,
      durationMinutes: job.durationMinutes,
    });

    if (job.startTime !== startTime) {
      await db.update(jobs).set({ startTime, updatedAt: timestamp }).where(eq(jobs.id, job.id));
    }
  }
}

export async function getEquipmentState(): Promise<EquipmentState> {
  await ensureSeeded();

  const db = getDb();
  const equipmentRows = await db.select().from(equipments).orderBy(asc(equipments.sortOrder), asc(equipments.createdAt));
  const jobRows = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ["active", "scheduled"]))
    .orderBy(asc(jobs.startTime), asc(jobs.createdAt));

  return mapState(equipmentRows, jobRows);
}

export async function addEquipment(name: unknown, category: unknown) {
  await ensureSeeded();

  const parsedCategory = parseCategory(category);
  const trimmedName = typeof name === "string" ? name.trim() : "";

  if (!trimmedName) {
    throw new RepositoryError("장비명을 입력해주세요.");
  }

  const db = getDb();
  const [sortRow] = await db.select({ value: max(equipments.sortOrder) }).from(equipments);
  const timestamp = nowIso();

  await db.insert(equipments).values({
    id: createId("equipment"),
    name: trimmedName,
    category: parsedCategory,
    status: "idle",
    sortOrder: (sortRow?.value ?? 0) + 10,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return getEquipmentState();
}

export async function deleteEquipment(equipmentId: unknown) {
  await ensureSeeded();

  if (typeof equipmentId !== "string" || !equipmentId) {
    throw new RepositoryError("삭제할 장비가 올바르지 않습니다.");
  }

  const db = getDb();
  await db.delete(jobs).where(eq(jobs.equipmentId, equipmentId));
  await db.delete(equipments).where(eq(equipments.id, equipmentId));

  return getEquipmentState();
}

export async function restoreDefaultEquipments() {
  await ensureDatabase();
  await seedDefaultEquipments();
  return getEquipmentState();
}

export async function startJob(equipmentId: unknown, input: Partial<JobInput>) {
  await ensureSeeded();

  if (typeof equipmentId !== "string" || !equipmentId) {
    throw new RepositoryError("장비를 선택해주세요.");
  }

  const jobInput = normalizeJobInput(input);
  if (!jobInput) {
    throw new RepositoryError("작업명, 담당팀, 예상 소요 시간을 확인해주세요.");
  }

  const equipment = await getEquipmentOrThrow(equipmentId);
  if (equipment.status === "maintenance") {
    throw new RepositoryError("점검 중인 장비는 작업을 시작할 수 없습니다.", 409);
  }

  if (await getActiveJob(equipmentId)) {
    throw new RepositoryError("이미 진행 중인 작업이 있습니다.", 409);
  }

  const db = getDb();
  const timestamp = nowIso();

  await db.insert(jobs).values({
    id: createId("job"),
    equipmentId,
    kind: "current",
    status: "active",
    title: jobInput.title,
    team: jobInput.team,
    startTime: timestamp,
    durationMinutes: jobInput.durationMinutes,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await rebalanceReservations(equipmentId);
  await syncEquipmentStatus(equipmentId);

  return getEquipmentState();
}

export async function completeJob(equipmentId: unknown) {
  await ensureSeeded();

  if (typeof equipmentId !== "string" || !equipmentId) {
    throw new RepositoryError("장비를 선택해주세요.");
  }

  await getEquipmentOrThrow(equipmentId);

  const db = getDb();
  const timestamp = nowIso();

  await db
    .update(jobs)
    .set({ status: "completed", updatedAt: timestamp })
    .where(and(eq(jobs.equipmentId, equipmentId), eq(jobs.kind, "current"), eq(jobs.status, "active")));

  await rebalanceReservations(equipmentId);
  await syncEquipmentStatus(equipmentId);

  return getEquipmentState();
}

export async function addReservation(equipmentId: unknown, input: Partial<JobInput>) {
  await ensureSeeded();

  if (typeof equipmentId !== "string" || !equipmentId) {
    throw new RepositoryError("장비를 선택해주세요.");
  }

  const jobInput = normalizeJobInput(input);
  if (!jobInput) {
    throw new RepositoryError("예약 작업명, 담당팀, 예상 소요 시간을 확인해주세요.");
  }

  await getEquipmentOrThrow(equipmentId);

  const db = getDb();
  const timestamp = nowIso();
  const scheduledJobs = await getScheduledJobs(equipmentId);
  let startAt = await reservationCursor(equipmentId);

  for (const job of scheduledJobs) {
    startAt = getJobEndTime({
      startTime: startAt.toISOString(),
      durationMinutes: job.durationMinutes,
    });
  }

  await db.insert(jobs).values({
    id: createId("reservation"),
    equipmentId,
    kind: "reservation",
    status: "scheduled",
    title: jobInput.title,
    team: jobInput.team,
    startTime: nowIso(startAt),
    durationMinutes: jobInput.durationMinutes,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await syncEquipmentStatus(equipmentId);

  return getEquipmentState();
}

export async function startReservation(equipmentId: unknown, reservationId: unknown) {
  await ensureSeeded();

  if (typeof equipmentId !== "string" || typeof reservationId !== "string") {
    throw new RepositoryError("예약 정보를 찾을 수 없습니다.");
  }

  const equipment = await getEquipmentOrThrow(equipmentId);
  if (equipment.status === "maintenance") {
    throw new RepositoryError("점검 중인 장비는 작업을 시작할 수 없습니다.", 409);
  }

  if (await getActiveJob(equipmentId)) {
    throw new RepositoryError("이미 진행 중인 작업이 있습니다.", 409);
  }

  const db = getDb();
  const [reservation] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, reservationId), eq(jobs.equipmentId, equipmentId), eq(jobs.status, "scheduled")))
    .limit(1);

  if (!reservation) {
    throw new RepositoryError("예약을 찾을 수 없습니다.", 404);
  }

  const timestamp = nowIso();

  await db
    .update(jobs)
    .set({
      kind: "current",
      status: "active",
      startTime: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(jobs.id, reservationId));

  await rebalanceReservations(equipmentId);
  await syncEquipmentStatus(equipmentId);

  return getEquipmentState();
}

export async function removeReservation(equipmentId: unknown, reservationId: unknown) {
  await ensureSeeded();

  if (typeof equipmentId !== "string" || typeof reservationId !== "string") {
    throw new RepositoryError("예약 정보를 찾을 수 없습니다.");
  }

  await getEquipmentOrThrow(equipmentId);

  const db = getDb();
  await db.delete(jobs).where(and(eq(jobs.id, reservationId), eq(jobs.equipmentId, equipmentId), eq(jobs.status, "scheduled")));

  await rebalanceReservations(equipmentId);
  await syncEquipmentStatus(equipmentId);

  return getEquipmentState();
}

export async function setMaintenance(equipmentId: unknown, maintenance: unknown) {
  await ensureSeeded();

  if (typeof equipmentId !== "string") {
    throw new RepositoryError("장비를 선택해주세요.");
  }

  await getEquipmentOrThrow(equipmentId);

  const db = getDb();
  const timestamp = nowIso();

  if (Boolean(maintenance)) {
    await db
      .update(jobs)
      .set({ status: "completed", updatedAt: timestamp })
      .where(and(eq(jobs.equipmentId, equipmentId), eq(jobs.kind, "current"), eq(jobs.status, "active")));
    await db.update(equipments).set({ status: "maintenance", updatedAt: timestamp }).where(eq(equipments.id, equipmentId));
  } else {
    await db.update(equipments).set({ status: "idle", updatedAt: timestamp }).where(eq(equipments.id, equipmentId));
    await rebalanceReservations(equipmentId);
    await syncEquipmentStatus(equipmentId);
  }

  return getEquipmentState();
}
