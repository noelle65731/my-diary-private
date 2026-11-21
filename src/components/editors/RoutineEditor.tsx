"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { Modal, TextInput, Toggle } from "@/components/common/primitives";
import { EditorFooter, ErrorNote } from "@/components/editors/shared";
import { cn } from "@/lib/utils";
import { ROUTINE_DAYS, type Routine } from "@/lib/types";

interface FormState {
  title: string;
  category: "개인" | "공부";
  repeatDays: string[];
  targetCount: string;
  amount: string;
  unit: string;
  hidden: boolean;
  history: boolean;
}

function formFromRoutine(routine: Routine): FormState {
  return {
    title: routine.title,
    category: routine.category,
    repeatDays: routine.repeatDays,
    targetCount: routine.targetCount ? String(routine.targetCount) : "1",
    amount: routine.amount ? String(routine.amount) : "",
    unit: routine.unit,
    hidden: routine.hidden,
    history: routine.history,
  };
}

export function RoutineEditor({
  open,
  routineId,
  onClose,
}: {
  open: boolean;
  routineId?: string | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return <RoutineEditorInner key={routineId ?? "new"} routineId={routineId ?? null} onClose={onClose} />;
}

function RoutineEditorInner({ routineId, onClose }: { routineId: string | null; onClose: () => void }) {
  const { data, create, update, remove } = useData();
  const existing = routineId ? data.routines.find((item) => item.id === routineId && item.kind === "루틴") ?? null : null;
  const [form, setForm] = useState<FormState>(
    existing
      ? formFromRoutine(existing)
      : {
          title: "",
          category: "개인",
          repeatDays: ["월", "화", "수", "목", "금", "토", "일"],
          targetCount: "1",
          amount: "",
          unit: "",
          hidden: false,
          history: false,
        },
  );
  const [error, setError] = useState<string | null>(null);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggleDay = (day: string) => {
    patch("repeatDays", form.repeatDays.includes(day) ? form.repeatDays.filter((value) => value !== day) : [...form.repeatDays, day]);
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    const target = Number(form.targetCount);
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      kind: "루틴",
      category: form.category,
      repeatDays: form.repeatDays,
      targetCount: Number.isFinite(target) && target > 0 ? Math.floor(target) : 1,
      amount: form.amount ? Number(form.amount) : null,
      unit: form.unit,
      hidden: form.hidden,
      history: form.history,
    };
    if (existing) {
      const ok = await update("routines", existing.id, payload);
      if (!ok) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    } else {
      const created = await create("routines", payload);
      if (!created) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "루틴 수정" : "새 루틴"}
      size="sm"
      footer={
        <EditorFooter
          onClose={onClose}
          onSave={() => void save()}
          onDelete={existing ? () => void remove("routines", existing.id).then(onClose) : undefined}
          onRestore={existing ? () => void update("routines", existing.id, { trash: false }).then(onClose) : undefined}
          trashed={existing?.trash}
          saveLabel={existing ? "저장" : "추가"}
        />
      }
    >
      <div className="space-y-3.5">
        <TextInput
          autoFocus
          value={form.title}
          onChange={(event) => patch("title", event.target.value)}
          placeholder="예: 물 마시기, 스트레칭"
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[18px] font-medium focus:ring-0"
        />

        <div>
          <p className="label">분류</p>
          <div className="flex gap-1.5">
            {(["개인", "공부"] as const).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => patch("category", category)}
                className={cn(
                  "chip border transition",
                  form.category === category
                    ? "border-ink-900 bg-ink-900 text-paper-50"
                    : "border-paper-400 bg-white/60 text-ink-600",
                )}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label">반복 요일</p>
          <div className="flex flex-wrap gap-1">
            {ROUTINE_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={cn(
                  "h-8 w-8 rounded-full text-[15px] font-medium transition",
                  form.repeatDays.includes(day) ? "bg-ink-900 text-paper-50" : "bg-paper-200 text-ink-500 hover:bg-paper-300",
                )}
              >
                {day}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[14px] text-ink-400">요일을 모두 끄면 '언제든' 루틴이 됩니다.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">하루 목표 횟수</span>
            <TextInput
              type="number"
              min={1}
              value={form.targetCount}
              onChange={(event) => patch("targetCount", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">한 번의 양 (선택)</span>
            <TextInput
              type="number"
              min={0}
              value={form.amount}
              onChange={(event) => patch("amount", event.target.value)}
              placeholder="예: 10"
            />
          </label>
        </div>

        <label className="block">
          <span className="label">단위</span>
          <TextInput value={form.unit} onChange={(event) => patch("unit", event.target.value)} placeholder="예: 컵, 쪽, 회" />
        </label>

        <div className="rounded-xl border border-paper-300/80 bg-paper-50/60 px-3 py-1">
          <Toggle checked={form.hidden} onChange={(value) => patch("hidden", value)} label="기본 보기에서 숨김" />
          <Toggle checked={form.history} onChange={(value) => patch("history", value)} label="지난 루틴으로 보내기" />
        </div>

        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
