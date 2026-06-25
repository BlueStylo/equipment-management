"use client";

import { Clock3, ListPlus, Printer, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  deriveStatus,
  Equipment,
  EquipmentState,
  formatDateTime,
  getJobTiming,
  JobInput,
  statusLabels,
} from "@/lib/equipment";

type JobFormState = {
  title: string;
  team: string;
  durationMinutes: string;
};

const initialForm: JobFormState = {
  title: "",
  team: "",
  durationMinutes: "60",
};

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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
      {label}
      {children}
    </label>
  );
}

export function MobileQuickEntry({ equipmentId }: { equipmentId: string }) {
  const [state, setState] = useState<EquipmentState | null>(null);
  const [form, setForm] = useState<JobFormState>(initialForm);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/equipment", { cache: "no-store" });
      const nextState = (await response.json()) as EquipmentState | { error?: string };
      if (!response.ok || "error" in nextState) {
        throw new Error("error" in nextState ? nextState.error : "장비 정보를 불러오지 못했습니다.");
      }
      setState(nextState);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "장비 정보를 불러오지 못했습니다.");
    }
  }

  async function submit(action: "startJob" | "addReservation") {
    const input = formToInput(form);
    if (!input) {
      setError("작업명, 담당팀, 예상 소요 시간을 입력해주세요.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, equipmentId, ...input }),
      });
      const nextState = (await response.json()) as EquipmentState | { error?: string };
      if (!response.ok || "error" in nextState) {
        throw new Error("error" in nextState ? nextState.error : "입력 내용을 저장하지 못했습니다.");
      }
      setState(nextState);
      setForm(initialForm);
      setMessage(action === "startJob" ? "작업을 시작했습니다." : "예약을 추가했습니다.");
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "입력 내용을 저장하지 못했습니다.");
      setMessage(null);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const equipment: Equipment | null = useMemo(() => {
    return state?.equipments.find((item) => item.id === equipmentId) ?? null;
  }, [equipmentId, state]);
  const status = equipment ? deriveStatus(equipment) : "idle";
  const timing = equipment?.currentJob ? getJobTiming(equipment.currentJob) : null;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950">
      <section className="mx-auto grid max-w-md gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-slate-950 text-white">
              <Printer aria-hidden="true" size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">모바일 빠른 입력</p>
              <h1 className="mt-1 break-words text-xl font-bold text-slate-950">
                {equipment?.name ?? "장비 확인 중"}
              </h1>
            </div>
          </div>

          {equipment ? (
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-600">상태</span>
                <span className="font-bold text-slate-950">{statusLabels[status]}</span>
              </div>
              {equipment.currentJob && timing ? (
                <p className="mt-2 text-xs text-slate-500">
                  {equipment.currentJob.title} · 종료 {formatDateTime(timing.endTime)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <form
          className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={(event: FormEvent) => event.preventDefault()}
        >
          <Field label="작업명">
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="min-h-11 rounded-md border border-slate-200 px-3 text-base font-medium outline-none transition focus:border-slate-500"
              placeholder="예: 시제품 출력"
            />
          </Field>
          <Field label="담당팀">
            <input
              value={form.team}
              onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}
              className="min-h-11 rounded-md border border-slate-200 px-3 text-base font-medium outline-none transition focus:border-slate-500"
              placeholder="예: 생산팀"
            />
          </Field>
          <Field label="예상 소요 시간(분)">
            <input
              type="number"
              min="1"
              value={form.durationMinutes}
              onChange={(event) =>
                setForm((current) => ({ ...current, durationMinutes: event.target.value }))
              }
              className="min-h-11 rounded-md border border-slate-200 px-3 text-base font-medium outline-none transition focus:border-slate-500"
            />
          </Field>

          {message ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => submit("startJob")}
              disabled={pending || !equipment || Boolean(equipment.currentJob) || status === "maintenance"}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {pending ? <RefreshCw className="animate-spin" aria-hidden="true" size={18} /> : <Clock3 aria-hidden="true" size={18} />}
              지금 시작
            </button>
            <button
              type="button"
              onClick={() => submit("addReservation")}
              disabled={pending || !equipment}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-base font-semibold text-slate-950 transition hover:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <ListPlus aria-hidden="true" size={18} />
              예약 추가
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
