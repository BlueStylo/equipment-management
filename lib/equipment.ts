export type EquipmentCategory = "printing" | "sterilization";

export type EquipmentStatus = "idle" | "running" | "reserved" | "maintenance";

export type JobInput = {
  title: string;
  team: string;
  durationMinutes: number;
};

export type Job = JobInput & {
  id: string;
  startTime: string;
  createdAt: string;
};

export type Reservation = Job & {
  status: "scheduled";
};

export type Equipment = {
  id: string;
  name: string;
  category: EquipmentCategory;
  status: EquipmentStatus;
  currentJob: Job | null;
  reservations: Reservation[];
  createdAt: string;
  updatedAt: string;
};

export type EquipmentState = {
  equipments: Equipment[];
  updatedAt: string;
};

export type JobTiming = {
  elapsedMinutes: number;
  remainingMinutes: number;
  totalMinutes: number;
  progress: number;
  endTime: string;
};

export const categoryOrder: EquipmentCategory[] = ["printing", "sterilization"];

export const categoryLabels: Record<EquipmentCategory, string> = {
  printing: "3D 프린팅 장비",
  sterilization: "멸균 장비",
};

export const statusLabels: Record<EquipmentStatus, string> = {
  idle: "대기 중",
  running: "작업 중",
  reserved: "예약 있음",
  maintenance: "점검 중",
};

export const defaultEquipments: Array<{
  id: string;
  name: string;
  category: EquipmentCategory;
}> = [
  { id: "printing-polyjet", name: "PolyJet 3D Printer", category: "printing" },
  { id: "printing-bambu-a1-mini-1", name: "Bambu Lab A1 mini #1", category: "printing" },
  { id: "printing-bambu-a1-mini-2", name: "Bambu Lab A1 mini #2", category: "printing" },
  { id: "printing-bambu-h2d", name: "Bambu Lab H2D", category: "printing" },
  { id: "printing-formlabs-form-4", name: "Formlabs Form 4", category: "printing" },
  { id: "sterilizer-1", name: "멸균기 #1", category: "sterilization" },
  { id: "sterilizer-2", name: "멸균기 #2", category: "sterilization" },
  { id: "sterilizer-3", name: "멸균기 #3", category: "sterilization" },
];

export function getJobTiming(job: Job, now = new Date()): JobTiming {
  const startMs = new Date(job.startTime).getTime();
  const totalMinutes = Math.max(1, job.durationMinutes);
  const endMs = startMs + totalMinutes * 60_000;
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - startMs) / 60_000));
  const remainingMinutes = Math.max(0, Math.ceil((endMs - now.getTime()) / 60_000));
  const progress = Math.min(100, Math.max(0, (elapsedMinutes / totalMinutes) * 100));

  return {
    elapsedMinutes,
    remainingMinutes,
    totalMinutes,
    progress,
    endTime: new Date(endMs).toISOString(),
  };
}

export function deriveStatus(equipment: Equipment): EquipmentStatus {
  if (equipment.status === "maintenance") {
    return "maintenance";
  }

  if (equipment.currentJob) {
    return "running";
  }

  if (equipment.reservations.length > 0) {
    return "reserved";
  }

  return "idle";
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;

  if (hours === 0) {
    return `${rest}분`;
  }

  if (rest === 0) {
    return `${hours}시간`;
  }

  return `${hours}시간 ${rest}분`;
}

export function getJobEndTime(job: Pick<Job, "startTime" | "durationMinutes">) {
  return new Date(new Date(job.startTime).getTime() + job.durationMinutes * 60_000);
}

export function normalizeJobInput(input: Partial<JobInput>): JobInput | null {
  const durationMinutes = Number(input.durationMinutes);
  const title = input.title?.trim() ?? "";
  const team = input.team?.trim() ?? "";

  if (!title || !team || Number.isNaN(durationMinutes) || durationMinutes < 1) {
    return null;
  }

  return {
    title,
    team,
    durationMinutes: Math.round(durationMinutes),
  };
}
