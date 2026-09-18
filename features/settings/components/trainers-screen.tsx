"use client";

import { useState } from "react";
import { FieldError } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { formatMoney, formatTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import {
  saveAssignment,
  saveClassSlot,
  saveProgram,
  saveTrainer,
  saveTrainerFee,
} from "../catalog-actions";
import { ActionDialog, InlineForm } from "./action-dialog";

export type Trainer = {
  id: string;
  full_name: string;
  is_active: boolean;
  /** BR-026: present for owners and admins only. */
  personal_gym_fee?: string | null;
  /** D-62: null means the plan's percentage applies. */
  group_share_pct?: string | null;
};
export type Program = {
  id: string;
  name: string;
  kind: "group" | "personal";
  is_active: boolean;
};
export type Assignment = { trainer_id: string; program_id: string };
export type Slot = {
  id: string;
  program_id: string;
  trainer_id: string;
  weekday: number;
  starts_at: string;
  is_active: boolean;
};

/** S-24, four sections in the order doc 06 gives them. */
export function TrainersScreen({
  trainers,
  programs,
  assignments,
  slots,
  canSeeFees,
}: {
  trainers: Trainer[];
  programs: Program[];
  assignments: Assignment[];
  slots: Slot[];
  canSeeFees: boolean;
}) {
  return (
    <div className="grid gap-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {me.settings.trainersTitle}
      </h1>
      <TrainersSection trainers={trainers} canSeeFees={canSeeFees} />
      <ProgramsSection programs={programs} />
      <AssignmentsSection
        trainers={trainers}
        programs={programs}
        assignments={assignments}
      />
      <ScheduleSection
        slots={slots}
        trainers={trainers}
        programs={programs}
        assignments={assignments}
      />
    </div>
  );
}

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {action}
    </div>
  );
}

function TrainersSection({
  trainers,
  canSeeFees,
}: {
  trainers: Trainer[];
  canSeeFees: boolean;
}) {
  const [editing, setEditing] = useState<Trainer | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section>
      <SectionHeader
        title={me.settings.trainers}
        action={
          <Button onClick={() => setCreating(true)}>
            {me.settings.addTrainer}
          </Button>
        }
      />
      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.settings.trainerName}</Th>
              <Th>{me.settings.active}</Th>
              {/* BR-026 and US-22.1 AC3: the money columns are for owners only. */}
              {canSeeFees ? <Th>{me.settings.trainerFee}</Th> : null}
              {canSeeFees ? <Th>{me.settings.groupShare}</Th> : null}
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {trainers.length === 0 ? (
              <tr>
                <Td
                  colSpan={canSeeFees ? 5 : 3}
                  className="text-muted-foreground"
                >
                  {me.settings.empty}
                </Td>
              </tr>
            ) : (
              trainers.map((trainer) => (
                <tr key={trainer.id}>
                  <Td className="font-medium">{trainer.full_name}</Td>
                  <Td>{trainer.is_active ? me.users.yes : me.users.no}</Td>
                  {canSeeFees ? (
                    <Td colSpan={2}>
                      <TrainerFeeForm trainer={trainer} />
                    </Td>
                  ) : null}
                  <Td className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(trainer)}
                    >
                      {me.users.edit}
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrapper>

      <ActionDialog
        title={me.settings.addTrainer}
        open={creating}
        onOpenChange={setCreating}
        action={saveTrainer}
      >
        {(state) => <TrainerFields state={state} />}
      </ActionDialog>
      <ActionDialog
        title={me.settings.editTrainer}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        action={saveTrainer}
      >
        {(state) =>
          editing ? <TrainerFields state={state} trainer={editing} /> : null
        }
      </ActionDialog>
    </section>
  );
}

function TrainerFields({
  state,
  trainer,
}: {
  state: { fieldErrors?: Record<string, string> };
  trainer?: Trainer;
}) {
  return (
    <>
      <input type="hidden" name="id" value={trainer?.id ?? ""} />
      <div className="grid gap-1.5">
        <Label htmlFor="trainer-name">{me.settings.trainerName}</Label>
        <Input
          id="trainer-name"
          name="fullName"
          defaultValue={trainer?.full_name ?? ""}
          required
        />
        <FieldError id="trainer-name-error">
          {state.fieldErrors?.fullName}
        </FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={trainer?.is_active ?? true}
          className="size-4"
        />
        {me.settings.active}
      </label>
    </>
  );
}

/**
 * BR-004: both are prices, so a change applies to new sales only.
 * D-62: an empty group share means the plan's percentage applies.
 */
function TrainerFeeForm({ trainer }: { trainer: Trainer }) {
  return (
    <InlineForm action={saveTrainerFee} className="flex items-center gap-2">
      {(pending) => (
        <>
          <input type="hidden" name="trainerId" value={trainer.id} />
          <Input
            name="fee"
            defaultValue={
              trainer.personal_gym_fee
                ? formatMoney(trainer.personal_gym_fee)
                : ""
            }
            placeholder={me.settings.feeUndefined}
            aria-label={me.settings.trainerFee}
            className="h-9 w-32"
          />
          <Input
            name="groupSharePct"
            defaultValue={
              trainer.group_share_pct ? Number(trainer.group_share_pct) : ""
            }
            placeholder={me.settings.groupShareDefault}
            aria-label={me.settings.groupShare}
            inputMode="decimal"
            className="h-9 w-28"
          />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {me.common.save}
          </Button>
        </>
      )}
    </InlineForm>
  );
}

function ProgramsSection({ programs }: { programs: Program[] }) {
  const [editing, setEditing] = useState<Program | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section>
      <SectionHeader
        title={me.settings.programs}
        action={
          <Button onClick={() => setCreating(true)}>
            {me.settings.addProgram}
          </Button>
        }
      />
      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.settings.programName}</Th>
              <Th>{me.settings.programKind}</Th>
              <Th>{me.settings.active}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => (
              <tr key={program.id}>
                <Td className="font-medium">{program.name}</Td>
                <Td>
                  {program.kind === "group"
                    ? me.settings.kindGroup
                    : me.settings.kindPersonal}
                </Td>
                <Td>{program.is_active ? me.users.yes : me.users.no}</Td>
                <Td className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(program)}
                  >
                    {me.users.edit}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrapper>

      <ActionDialog
        title={me.settings.addProgram}
        open={creating}
        onOpenChange={setCreating}
        action={saveProgram}
      >
        {(state) => <ProgramFields state={state} />}
      </ActionDialog>
      <ActionDialog
        title={me.settings.editProgram}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        action={saveProgram}
      >
        {(state) =>
          editing ? <ProgramFields state={state} program={editing} /> : null
        }
      </ActionDialog>
    </section>
  );
}

function ProgramFields({
  state,
  program,
}: {
  state: { fieldErrors?: Record<string, string> };
  program?: Program;
}) {
  return (
    <>
      <input type="hidden" name="id" value={program?.id ?? ""} />
      <div className="grid gap-1.5">
        <Label htmlFor="program-name">{me.settings.programName}</Label>
        <Input
          id="program-name"
          name="name"
          defaultValue={program?.name ?? ""}
          required
        />
        <FieldError id="program-name-error">
          {state.fieldErrors?.name}
        </FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="program-kind">{me.settings.programKind}</Label>
        {/* The kind is fixed once a program exists: assignments depend on it. */}
        <Select
          id="program-kind"
          name="kind"
          defaultValue={program?.kind ?? "group"}
          disabled={Boolean(program)}
        >
          <option value="group">{me.settings.kindGroup}</option>
          <option value="personal">{me.settings.kindPersonal}</option>
        </Select>
        {program ? (
          <input type="hidden" name="kind" value={program.kind} />
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={program?.is_active ?? true}
          className="size-4"
        />
        {me.settings.active}
      </label>
    </>
  );
}

/** BR-023: the matrix that decides who may be picked for which program. */
function AssignmentsSection({
  trainers,
  programs,
  assignments,
}: {
  trainers: Trainer[];
  programs: Program[];
  assignments: Assignment[];
}) {
  const assigned = new Set(
    assignments.map((item) => `${item.trainer_id}:${item.program_id}`),
  );

  return (
    <section>
      <SectionHeader title={me.settings.assignments} />
      <p className="mb-3 text-sm text-muted-foreground">
        {me.settings.assignmentsHint}
      </p>
      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.settings.trainerName}</Th>
              {programs.map((program) => (
                <Th key={program.id}>{program.name}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trainers.map((trainer) => (
              <tr key={trainer.id}>
                <Td className="font-medium">{trainer.full_name}</Td>
                {programs.map((program) => (
                  <Td key={program.id}>
                    <AssignmentToggle
                      trainer={trainer}
                      program={program}
                      checked={assigned.has(`${trainer.id}:${program.id}`)}
                    />
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrapper>
    </section>
  );
}

function AssignmentToggle({
  trainer,
  program,
  checked,
}: {
  trainer: Trainer;
  program: Program;
  checked: boolean;
}) {
  return (
    <InlineForm action={saveAssignment}>
      {(pending) => (
        <>
          <input type="hidden" name="trainerId" value={trainer.id} />
          <input type="hidden" name="programId" value={program.id} />
          <input
            type="hidden"
            name="assigned"
            value={checked ? "false" : "true"}
          />
          <button
            type="submit"
            disabled={pending}
            role="switch"
            aria-checked={checked}
            aria-label={`${trainer.full_name} – ${program.name}`}
            className="flex size-6 items-center justify-center rounded border bg-card text-sm"
          >
            {checked ? "✓" : ""}
          </button>
        </>
      )}
    </InlineForm>
  );
}

/** BR-022 and BR-024: the weekly schedule, Monday first. */
function ScheduleSection({
  slots,
  trainers,
  programs,
  assignments,
}: {
  slots: Slot[];
  trainers: Trainer[];
  programs: Program[];
  assignments: Assignment[];
}) {
  const [creating, setCreating] = useState(false);
  const trainerName = new Map(trainers.map((t) => [t.id, t.full_name]));

  return (
    <section>
      <SectionHeader
        title={me.settings.schedule}
        action={
          <Button onClick={() => setCreating(true)}>
            {me.settings.addSlot}
          </Button>
        }
      />
      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.settings.slotDay}</Th>
              <Th>{me.settings.slotTime}</Th>
              <Th>{me.settings.slotTrainer}</Th>
              <Th>{me.settings.active}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 ? (
              <tr>
                <Td colSpan={5} className="text-muted-foreground">
                  {me.settings.noSlots}
                </Td>
              </tr>
            ) : (
              slots.map((slot) => (
                <tr key={slot.id}>
                  <Td>{me.settings.weekdays[slot.weekday - 1]}</Td>
                  <Td>{formatTime(`1970-01-01T${slot.starts_at}`)}</Td>
                  <Td>{trainerName.get(slot.trainer_id)}</Td>
                  <Td>{slot.is_active ? me.users.yes : me.users.no}</Td>
                  <Td className="text-right">
                    <SlotActiveToggle slot={slot} />
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrapper>

      <ActionDialog
        title={me.settings.addSlot}
        open={creating}
        onOpenChange={setCreating}
        action={saveClassSlot}
      >
        {(state) => (
          <SlotFields
            state={state}
            trainers={trainers}
            programs={programs}
            assignments={assignments}
          />
        )}
      </ActionDialog>
    </section>
  );
}

function SlotActiveToggle({ slot }: { slot: Slot }) {
  return (
    <InlineForm action={saveClassSlot}>
      {(pending) => (
        <>
          <input type="hidden" name="id" value={slot.id} />
          <input type="hidden" name="programId" value={slot.program_id} />
          <input type="hidden" name="trainerId" value={slot.trainer_id} />
          <input type="hidden" name="weekday" value={slot.weekday} />
          <input
            type="hidden"
            name="startsAt"
            value={slot.starts_at.slice(0, 5)}
          />
          <input
            type="hidden"
            name="isActive"
            value={slot.is_active ? "false" : "true"}
          />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {slot.is_active ? me.users.deactivate : me.users.activate}
          </Button>
        </>
      )}
    </InlineForm>
  );
}

function SlotFields({
  state,
  trainers,
  programs,
  assignments,
}: {
  state: { fieldErrors?: Record<string, string> };
  trainers: Trainer[];
  programs: Program[];
  assignments: Assignment[];
}) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  // BR-024: only trainers assigned to the chosen program can be picked, so a slot
  // that the database would reject cannot even be submitted.
  const allowed = new Set(
    assignments
      .filter((item) => item.program_id === programId)
      .map((item) => item.trainer_id),
  );

  return (
    <>
      <input type="hidden" name="id" value="" />
      <input type="hidden" name="isActive" value="true" />
      <div className="grid gap-1.5">
        <Label htmlFor="slot-program">{me.settings.slotProgram}</Label>
        <Select
          id="slot-program"
          name="programId"
          value={programId}
          onChange={(event) => setProgramId(event.target.value)}
        >
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="slot-trainer">{me.settings.slotTrainer}</Label>
        <Select id="slot-trainer" name="trainerId" required>
          {trainers
            .filter((trainer) => trainer.is_active && allowed.has(trainer.id))
            .map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.full_name}
              </option>
            ))}
        </Select>
        <FieldError id="slot-trainer-error">
          {state.fieldErrors?.trainerId}
        </FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="slot-day">{me.settings.slotDay}</Label>
        <Select id="slot-day" name="weekday" defaultValue="1">
          {me.settings.weekdays.map((day, index) => (
            <option key={day} value={index + 1}>
              {day}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="slot-time">{me.settings.slotTime}</Label>
        <Input id="slot-time" name="startsAt" type="time" required />
        <FieldError id="slot-time-error">
          {state.fieldErrors?.startsAt}
        </FieldError>
      </div>
    </>
  );
}
