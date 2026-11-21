"use client";

import { useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useCategoryOptions } from "@/state/categories";
import { Modal, TextInput, Toggle } from "@/components/common/primitives";
import { EditorFooter, ErrorNote } from "@/components/editors/shared";
import { cn } from "@/lib/utils";
import { ROUTINE_DAYS, type Routine } from "@/lib/types";
import { writeRoutineNow } from "@/lib/routine-now";

interface FormState {
  title: string;
  category: string;
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
  const { addCategory } = useSettings();
  // A16: the same 분류 as the top filters — 업무·개인·공부 plus every user-made one.
  const categories = useCategoryOptions();
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
  /** A16: auto-save on close compares against what the window opened with. */
  const initialForm = useRef<FormState | null>(null);
  if (initialForm.current === null) {
    initialForm.current = existing
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
        };
  }
  const closing = useRef(false);
  /** A16: 루틴 안에서도 분류를 바로 새로 만들 수 있습니다 (할 일 창과 같은 방식). */
  const [newCategory, setNewCategory] = useState<string | null>(null);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const addNewCategory = () => {
    const name = (newCategory ?? "").trim();
    setNewCategory(null);
    if (!name) return;
    addCategory(name);
    patch("category", name);
  };

  const toggleDay = (day: string) => {
    patch("repeatDays", form.repeatDays.includes(day) ? form.repeatDays.filter((value) => value !== day) : [...form.repeatDays, day]);
  };

  const save = async (): Promise<boolean> => {
    if (!form.title.trim()) {
      setError("제목을 입력해 주세요.");
      return false;
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
        return false;
      }
      // A18: 노션에 NOW 숨김 속성이 없는 데이터베이스에서도 값이 남도록 이 브라우저에도 적습니다.
      writeRoutineNow(existing.id, form.hidden);
    } else {
      const created = await create("routines", payload);
      if (!created) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
      if (created.id) writeRoutineNow(created.id, form.hidden);
    }
    return true;
  };

  /** A16: X · 바깥 클릭 · 뒤로 가기로 닫아도 고친 내용은 저장합니다. */
  const closeWithSave = () => {
    if (closing.current) return;
    closing.current = true;
    const changed = JSON.stringify(form) !== JSON.stringify(initialForm.current);
    void (async () => {
      try {
        if (changed && form.title.trim()) await save();
      } finally {
        onClose();
      }
    })();
  };

  return (
    <Modal
      open
      onClose={closeWithSave}
      title={existing ? "루틴 수정" : "새 루틴"}
      size="sm"
      footer={
        <EditorFooter
          onClose={closeWithSave}
          onSave={() => void save().then((ok) => ok && onClose())}
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
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[calc(18px*var(--fs))] font-medium focus:ring-0"
        />

        <div>
          <p className="label">분류</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((category) => (
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
            {newCategory === null ? (
              <button
                type="button"
                onClick={() => setNewCategory("")}
                aria-label="분류 새로 추가"
                className="inline-flex h-7 items-center gap-0.5 rounded-full border border-dashed border-paper-400 px-2 text-[calc(14px*var(--fs))] text-ink-500 transition hover:border-ink-500 hover:text-ink-900"
              >
                <span className="text-[calc(15px*var(--fs))] leading-none">+</span> 분류
              </button>
            ) : (
              <input
                autoFocus
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addNewCategory();
                  }
                  if (event.key === "Escape") setNewCategory(null);
                }}
                onBlur={addNewCategory}
                placeholder="새 분류 이름"
                aria-label="새 분류 이름"
                className="input h-7 w-[7.5rem] py-0 text-[calc(14px*var(--fs))]"
              />
            )}
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
                  "h-8 w-8 rounded-full text-[calc(15px*var(--fs))] font-medium transition",
                  form.repeatDays.includes(day) ? "bg-ink-900 text-paper-50" : "bg-paper-200 text-ink-500 hover:bg-paper-300",
                )}
              >
                {day}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[calc(14px*var(--fs))] text-ink-400">요일을 모두 끄면 '언제든' 루틴이 됩니다.</p>
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
          <Toggle checked={form.hidden} onChange={(value) => patch("hidden", value)} label="NOW 숨김" />
          <Toggle checked={form.history} onChange={(value) => patch("history", value)} label="지난 루틴으로 보내기" />
        </div>
        <p className="text-[calc(13px*var(--fs))] leading-[1.5] text-ink-400">
          NOW 숨김을 켜면 프로젝트 탭의 NOW 스위치를 켰을 때 이 루틴이 프로젝트처럼 가려집니다.
        </p>

        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
