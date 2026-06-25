"use client";

import {
  Activity,
  CalendarClock,
  Check,
  Clock3,
  Factory,
  ListPlus,
  Plus,
  Printer,
  QrCode as QrCodeIcon,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { QrCode } from "./QrCode";
import {
  categoryLabels,
  categoryOrder,
  deriveStatus,
  Equipment,
  EquipmentCategory,
  EquipmentState,
  formatDateTime,
  formatDuration,
  getJobTiming,
  JobInput,
  statusLabels,
} from "@/lib/equipment";

type ScreenMode = "dashboard" | "qr";

type JobFormState = {
  title: string;
  team: string;
  durationMinutes: string;
};

const initialJobForm: JobFormState = {
  title: "",
  team: "",
  durationMinutes: "60",
};

const statusClassNames = {
  idle: "border-slate-200 bg-slate-100 text-slate-700",
  running: "border-emerald-200 bg-emerald-100 text-emerald-800",
  reserved: "border-amber-200 bg-amber-100 text-amber-800",
  maintenance: "border-rose-200 bg-rose-100 text-rose-800",
};

const statusDotClassNames = {
  idle: "bg-slate-400",
  running: "bg-emerald-500",
  reserved: "bg-amber-500",
  maintenance: "bg-rose-500",
};

function EquipmentIcon({ category }: { category: EquipmentCategory }) {
  return category === "printing" ? (
    <Printer aria-hidden="true" size={20} />
  ) : (
    <ShieldCheck aria-hidden="true" size={20} />
  );
}

function StatusBadge({ status }: { status: Equipment["status"] }) {
  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClassNames[status]}`}
    >
      <span className={`size-1.5 rounded-full ${statusDotClassNames[status]}`} />
      {statusLabels[status]}
    </span>
  );
}

function EmptyValue() {
  return <span className="text-slate-400">-</span>;
}

function formToInput(form: JobFormState): JobInput | null {
  const durationMinutes = Number(form.durationMinutes);
  const title = form.title.trim();
  const team = form.team.trim();

  if (!title || !team || Number.isNaN(durationMinutes) || durationMinutes < 1) {
    return null;
  }

  return {
    title,
    team,
    durationMinutes: Math.round(durationMinutes),
  };
}

function useOrigin() {
  return useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );
}

function buildMobileUrl(origin: string, equipmentId: string) {
  return origin ? `${origin}/mobile/${encodeURIComponent(equipmentId)}` : `/mobile/${equipmentId}`;
}

function EquipmentCard({
  equipment,
  selected,
  now,
  onSelect,
}: {
  equipment: Equipment;
  selected: boolean;
  now: Date;
  onSelect: () => void;
}) {
  const status = deriveStatus(equipment);
  const timing = equipment.currentJob ? getJobTiming(equipment.currentJob, now) : null;
  const hasReservation = equipment.reservations.length > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group grid min-h-[310px] w-full grid-rows-[auto_1fr_auto] rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md ${
        selected ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200"
      }`}
    >
      <span className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-slate-900 text-white">
          <EquipmentIcon category={equipment.category} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <span className="min-w-[150px] flex-1 truncate text-base font-semibold text-slate-950">
              {equipment.name}
            </span>
            <StatusBadge status={status} />
          </span>
          <span className="mt-1 block truncate text-xs font-medium text-slate-500">
            {categoryLabels[equipment.category]}
          </span>
        </span>
      </span>

      <span className="mt-5 grid gap-3">
        <span className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 text-sm">
          <span className="text-xs font-semibold text-slate-500">현재 작업</span>
          <span className="truncate font-semibold text-slate-950">
            {equipment.currentJob?.title ?? <EmptyValue />}
          </span>
          <span className="text-xs font-semibold text-slate-500">담당팀</span>
          <span className="truncate text-slate-700">
            {equipment.currentJob?.team ?? <EmptyValue />}
          </span>
          <span className="text-xs font-semibold text-slate-500">시작 시간</span>
          <span className="truncate text-slate-700">
            {equipment.currentJob ? formatDateTime(equipment.currentJob.startTime) : <EmptyValue />}
          </span>
          <span className="text-xs font-semibold text-slate-500">예상 종료</span>
          <span className="truncate text-slate-700">
            {timing ? formatDateTime(timing.endTime) : <EmptyValue />}
          </span>
          <span className="text-xs font-semibold text-slate-500">남은 시간</span>
          <span className="truncate text-slate-700">
            {timing ? formatDuration(timing.remainingMinutes) : <EmptyValue />}
          </span>
          <span className="text-xs font-semibold text-slate-500">예약 여부</span>
          <span className="truncate text-slate-700">
            {hasReservation ? `예, ${equipment.reservations.length}건` : "아니오"}
          </span>
        </span>

        <span className="block">
          <span className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>진행률</span>
            <span>{timing ? `${Math.round(timing.progress)}%` : "0%"}</span>
          </span>
          <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${timing?.progress ?? 0}%` }}
            />
          </span>
        </span>
      </span>

      <span className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock aria-hidden="true" size={14} />
          다음 예약 {equipment.reservations.length}건
        </span>
        <span className="font-medium text-slate-700 group-hover:text-slate-950">
          입력 화면 열기
        </span>
      </span>
    </button>
  );
}

function DetailPanel({
  equipment,
  now,
  mobileUrl,
  pending,
  onAction,
  onDeleted,
}: {
  equipment: Equipment;
  now: Date;
  mobileUrl: string;
  pending: boolean;
  onAction: (body: Record<string, unknown>) => Promise<boolean>;
  onDeleted: () => void;
}) {
  const [jobForm, setJobForm] = useState<JobFormState>(initialJobForm);
  const [reservationForm, setReservationForm] = useState<JobFormState>(initialJobForm);
  const status = deriveStatus(equipment);
  const timing = equipment.currentJob ? getJobTiming(equipment.currentJob, now) : null;

  function updateJobForm(field: keyof JobFormState, value: string) {
    setJobForm((current) => ({ ...current, [field]: value }));
  }

  function updateReservationForm(field: keyof JobFormState, value: string) {
    setReservationForm((current) => ({ ...current, [field]: value }));
  }

  async function handleStartJob(event: FormEvent) {
    event.preventDefault();
    const input = formToInput(jobForm);
    if (!input) return;

    const ok = await onAction({ action: "startJob", equipmentId: equipment.id, ...input });
    if (ok) setJobForm(initialJobForm);
  }

  async function handleAddReservation(event: FormEvent) {
    event.preventDefault();
    const input = formToInput(reservationForm);
    if (!input) return;

    const ok = await onAction({ action: "addReservation", equipmentId: equipment.id, ...input });
    if (ok) setReservationForm(initialJobForm);
  }

  async function handleDelete() {
    const ok = await onAction({ action: "deleteEquipment", equipmentId: equipment.id });
    if (ok) onDeleted();
  }

  return (
    <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">
              {categoryLabels[equipment.category]}
            </p>
            <h2 className="mt-1 break-words text-xl font-semibold text-slate-950">
              {equipment.name}
            </h2>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="mt-5 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-2">
            <span className="text-xs font-semibold text-slate-500">현재 작업</span>
            <span className="truncate font-semibold text-slate-950">
              {equipment.currentJob?.title ?? <EmptyValue />}
            </span>
            <span className="text-xs font-semibold text-slate-500">담당팀</span>
            <span className="truncate text-slate-700">
              {equipment.currentJob?.team ?? <EmptyValue />}
            </span>
            <span className="text-xs font-semibold text-slate-500">시작 시간</span>
            <span className="truncate text-slate-700">
              {equipment.currentJob ? formatDateTime(equipment.currentJob.startTime) : <EmptyValue />}
            </span>
            <span className="text-xs font-semibold text-slate-500">예상 종료</span>
            <span className="truncate text-slate-700">
              {timing ? formatDateTime(timing.endTime) : <EmptyValue />}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>진행률 {timing ? Math.round(timing.progress) : 0}%</span>
              <span>남은 시간 {timing ? formatDuration(timing.remainingMinutes) : "0분"}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${timing?.progress ?? 0}%` }}
              />
            </div>
          </div>

          {equipment.currentJob ? (
            <button
              type="button"
              onClick={() => onAction({ action: "completeJob", equipmentId: equipment.id })}
              disabled={pending}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:bg-slate-300"
            >
              <Check aria-hidden="true" size={17} />
              작업 완료
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 p-5">
        <form className="grid gap-3" onSubmit={handleStartJob}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Activity aria-hidden="true" size={17} />
            지금 시작
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              작업명
              <input
                value={jobForm.title}
                onChange={(event) => updateJobForm("title", event.target.value)}
                className="min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-500"
                placeholder="예: 시제품 출력"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              담당팀
              <input
                value={jobForm.team}
                onChange={(event) => updateJobForm("team", event.target.value)}
                className="min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-500"
                placeholder="예: 생산팀"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600 sm:col-span-2">
              예상 소요 시간(분)
              <input
                type="number"
                min="1"
                value={jobForm.durationMinutes}
                onChange={(event) => updateJobForm("durationMinutes", event.target.value)}
                className="min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-500"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={pending || status === "maintenance" || Boolean(equipment.currentJob)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Clock3 aria-hidden="true" size={17} />
            지금 시작
          </button>
        </form>

        <form className="grid gap-3 border-t border-slate-100 pt-5" onSubmit={handleAddReservation}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ListPlus aria-hidden="true" size={17} />
            예약 추가
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              작업명
              <input
                value={reservationForm.title}
                onChange={(event) => updateReservationForm("title", event.target.value)}
                className="min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-500"
                placeholder="예: 후처리용 파트"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              담당팀
              <input
                value={reservationForm.team}
                onChange={(event) => updateReservationForm("team", event.target.value)}
                className="min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-500"
                placeholder="예: 연구팀"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600 sm:col-span-2">
              예상 소요 시간(분)
              <input
                type="number"
                min="1"
                value={reservationForm.durationMinutes}
                onChange={(event) => updateReservationForm("durationMinutes", event.target.value)}
                className="min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-500"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Plus aria-hidden="true" size={17} />
            예약 추가
          </button>
        </form>

        <section className="border-t border-slate-100 pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">예약 현황</h3>
            <span className="text-xs font-medium text-slate-500">
              {equipment.reservations.length}건
            </span>
          </div>
          {equipment.reservations.length > 0 ? (
            <div className="grid gap-2">
              {equipment.reservations.map((reservation) => {
                const reservationTiming = getJobTiming(reservation, new Date(reservation.startTime));

                return (
                  <div
                    key={reservation.id}
                    className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {reservation.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {reservation.team} · 시작 {formatDateTime(reservation.startTime)} · 종료{" "}
                        {formatDateTime(reservationTiming.endTime)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onAction({
                            action: "startReservation",
                            equipmentId: equipment.id,
                            reservationId: reservation.id,
                          })
                        }
                        disabled={pending || Boolean(equipment.currentJob) || status === "maintenance"}
                        className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Clock3 aria-hidden="true" size={14} />
                        지금 시작
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAction({
                            action: "removeReservation",
                            equipmentId: equipment.id,
                            reservationId: reservation.id,
                          })
                        }
                        disabled={pending}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <Trash2 aria-hidden="true" size={14} />
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
              이 장비에 등록된 예약이 없습니다.
            </p>
          )}
        </section>

        <section className="grid gap-3 border-t border-slate-100 pt-5">
          <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-md border border-slate-200 p-3">
            <QrCode value={mobileUrl} title={`${equipment.name} 모바일 입력 QR`} className="size-28 text-slate-950" />
            <div className="min-w-0 self-center">
              <p className="text-xs font-semibold text-slate-500">모바일 빠른 입력</p>
              <p className="mt-1 break-all text-xs text-slate-600">{mobileUrl}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onAction({
                action: "setMaintenance",
                equipmentId: equipment.id,
                maintenance: status !== "maintenance",
              })
            }
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Wrench aria-hidden="true" size={17} />
            {status === "maintenance" ? "점검 해제" : "점검 중으로 전환"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Trash2 aria-hidden="true" size={17} />
            장비 삭제
          </button>
        </section>
      </div>
    </aside>
  );
}

function QrPrintView({
  equipments,
  origin,
  onBack,
}: {
  equipments: Equipment[];
  origin: string;
  onBack: () => void;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="print:hidden mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">QR 스티커 출력</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">장비별 모바일 입력 QR</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
          >
            대시보드
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Printer aria-hidden="true" size={17} />
            인쇄
          </button>
        </div>
      </div>

      <div className="qr-print-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {equipments.map((equipment) => {
          const mobileUrl = buildMobileUrl(origin, equipment.id);

          return (
            <article
              key={equipment.id}
              className="qr-label break-inside-avoid rounded-md border border-slate-300 bg-white p-4 text-slate-950"
            >
              <div className="grid grid-cols-[116px_minmax(0,1fr)] gap-4">
                <QrCode value={mobileUrl} title={`${equipment.name} 모바일 입력 QR`} className="size-28 text-slate-950" />
                <div className="min-w-0 self-center">
                  <p className="text-xs font-semibold text-slate-500">
                    {categoryLabels[equipment.category]}
                  </p>
                  <h3 className="mt-1 break-words text-lg font-bold leading-tight text-slate-950">
                    {equipment.name}
                  </h3>
                  <p className="mt-3 break-all text-[10px] leading-snug text-slate-500">
                    {mobileUrl}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-5 text-slate-950">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold shadow-sm">
        <RefreshCw className="animate-spin" aria-hidden="true" size={18} />
        장비 현황을 불러오는 중
      </div>
    </main>
  );
}

export function EquipmentDashboard() {
  const [state, setState] = useState<EquipmentState | null>(null);
  const [activeCategory, setActiveCategory] = useState<EquipmentCategory>("printing");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [now, setNow] = useState(new Date());
  const [screenMode, setScreenMode] = useState<ScreenMode>("dashboard");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const origin = useOrigin();

  async function refreshState({ silent = false } = {}) {
    if (!silent) setPending(true);
    try {
      const response = await fetch("/api/equipment", { cache: "no-store" });
      const nextState = (await response.json()) as EquipmentState | { error?: string };
      if (!response.ok || "error" in nextState) {
        throw new Error("error" in nextState ? nextState.error : "장비 현황을 불러오지 못했습니다.");
      }
      setState(nextState);
      setLastSyncedAt(new Date());
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "장비 현황을 불러오지 못했습니다.");
    } finally {
      if (!silent) setPending(false);
    }
  }

  async function runAction(body: Record<string, unknown>) {
    setPending(true);
    try {
      const response = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const nextState = (await response.json()) as EquipmentState | { error?: string };
      if (!response.ok || "error" in nextState) {
        throw new Error("error" in nextState ? nextState.error : "요청을 처리하지 못했습니다.");
      }
      setState(nextState);
      setLastSyncedAt(new Date());
      setError(null);
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "요청을 처리하지 못했습니다.");
      return false;
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => refreshState({ silent: true }), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => refreshState({ silent: true }), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleEquipments = useMemo(() => {
    return state?.equipments.filter((equipment) => equipment.category === activeCategory) ?? [];
  }, [activeCategory, state]);

  const selectedEquipment = useMemo(() => {
    return (
      visibleEquipments.find((equipment) => equipment.id === selectedId) ??
      visibleEquipments[0] ??
      null
    );
  }, [selectedId, visibleEquipments]);

  const counts = useMemo(() => {
    const equipments = state?.equipments ?? [];
    return {
      total: equipments.length,
      running: equipments.filter((equipment) => deriveStatus(equipment) === "running").length,
      reserved: equipments.filter((equipment) => deriveStatus(equipment) === "reserved").length,
      maintenance: equipments.filter((equipment) => deriveStatus(equipment) === "maintenance").length,
    };
  }, [state]);

  function handleCategoryChange(category: EquipmentCategory) {
    setActiveCategory(category);
    const firstEquipment = state?.equipments.find((equipment) => equipment.category === category);
    setSelectedId(firstEquipment?.id ?? null);
  }

  async function handleAddEquipment(event: FormEvent) {
    event.preventDefault();
    if (!newEquipmentName.trim()) {
      return;
    }

    const ok = await runAction({
      action: "addEquipment",
      category: activeCategory,
      name: newEquipmentName,
    });

    if (ok) {
      setNewEquipmentName("");
    }
  }

  if (!state) {
    return <LoadingState />;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="print:hidden border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-slate-950 text-white">
                  <Factory aria-hidden="true" size={22} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500">
                    내부 운영 대시보드
                  </p>
                  <h1 className="truncate text-2xl font-bold text-slate-950 sm:text-3xl">
                    장비 작업 모니터
                  </h1>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
              <div className="rounded-md border border-slate-200 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">전체 장비</p>
                <p className="mt-1 text-lg font-bold">{counts.total}</p>
              </div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-700">작업 중</p>
                <p className="mt-1 text-lg font-bold text-emerald-900">{counts.running}</p>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold text-amber-700">예약 있음</p>
                <p className="mt-1 text-lg font-bold text-amber-900">{counts.reserved}</p>
              </div>
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="text-xs font-semibold text-rose-700">점검 중</p>
                <p className="mt-1 text-lg font-bold text-rose-900">{counts.maintenance}</p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <nav
                aria-label="장비 카테고리"
                className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 sm:min-w-[390px]"
              >
                {categoryOrder.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      setScreenMode("dashboard");
                      handleCategoryChange(category);
                    }}
                    className={`flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                      screenMode === "dashboard" && activeCategory === category
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-950"
                    }`}
                  >
                    <EquipmentIcon category={category} />
                    <span className="truncate">{categoryLabels[category]}</span>
                  </button>
                ))}
              </nav>

              <button
                type="button"
                onClick={() => setScreenMode("qr")}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition ${
                  screenMode === "qr"
                    ? "bg-slate-950 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                }`}
              >
                <QrCodeIcon aria-hidden="true" size={17} />
                QR 스티커 출력
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <button
                type="button"
                onClick={() => refreshState()}
                disabled={pending}
                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <RefreshCw className={pending ? "animate-spin" : ""} aria-hidden="true" size={15} />
                새로고침
              </button>
              <span>
                마지막 동기화 {lastSyncedAt ? formatDateTime(lastSyncedAt.toISOString()) : formatDateTime(state.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {screenMode === "qr" ? (
        <QrPrintView
          equipments={state.equipments}
          origin={origin}
          onBack={() => setScreenMode("dashboard")}
        />
      ) : (
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:px-8">
          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-slate-950">
                  {categoryLabels[activeCategory]} 현황
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  10초마다 서버 데이터를 다시 읽어 모바일 입력을 반영합니다.
                </p>
              </div>
              <form
                onSubmit={handleAddEquipment}
                className="flex min-w-0 flex-col gap-2 sm:w-[420px] sm:flex-row"
              >
                <input
                  value={newEquipmentName}
                  onChange={(event) => setNewEquipmentName(event.target.value)}
                  className="min-h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-slate-500"
                  placeholder={`${categoryLabels[activeCategory]} 이름 입력`}
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
                >
                  <Plus aria-hidden="true" size={17} />
                  장비 추가
                </button>
              </form>
            </div>

            {visibleEquipments.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {visibleEquipments.map((equipment) => (
                  <EquipmentCard
                    key={equipment.id}
                    equipment={equipment}
                    selected={selectedEquipment?.id === equipment.id}
                    now={now}
                    onSelect={() => setSelectedId(equipment.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                이 카테고리에 등록된 장비가 없습니다.
              </div>
            )}
          </section>

          <section className="min-w-0 lg:sticky lg:top-5 lg:self-start">
            {selectedEquipment ? (
              <DetailPanel
                key={selectedEquipment.id}
                equipment={selectedEquipment}
                now={now}
                mobileUrl={buildMobileUrl(origin, selectedEquipment.id)}
                pending={pending}
                onAction={runAction}
                onDeleted={() => setSelectedId(null)}
              />
            ) : (
              <aside className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
                장비를 선택하면 작업 입력 화면이 표시됩니다.
              </aside>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
