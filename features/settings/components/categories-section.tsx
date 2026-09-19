"use client";

import { useState } from "react";
import { FieldError } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { me } from "@/lib/i18n/me";
import { saveExpenseCategory } from "../catalog-actions";
import { ActionDialog } from "./action-dialog";

export type Category = {
  id: string;
  name: string;
  is_salary: boolean;
  is_system: boolean;
  is_active: boolean;
};

/**
 * BR-131: add, rename, deactivate; never delete, and never deactivate a system one.
 * Reached from S-27 as a section of the settings page and from S-17 as a dialog, so the
 * owner can fix a category without leaving the expense screen (doc 06).
 */
export function CategoriesSection({
  categories,
  heading = true,
}: {
  categories: Category[];
  heading?: boolean;
}) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        {heading ? (
          <h2 className="text-lg font-semibold">{me.settings.categories}</h2>
        ) : (
          <span />
        )}
        <Button onClick={() => setCreating(true)}>
          {me.settings.addCategory}
        </Button>
      </div>
      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.settings.categoryName}</Th>
              <Th>{me.settings.active}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <Td className="font-medium">
                  {category.name}
                  {category.is_system ? (
                    <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {me.settings.systemCategory}
                    </span>
                  ) : null}
                  {category.is_salary ? (
                    <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {me.settings.salaryCategory}
                    </span>
                  ) : null}
                </Td>
                <Td>{category.is_active ? me.users.yes : me.users.no}</Td>
                <Td className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(category)}
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
        title={me.settings.addCategory}
        open={creating}
        onOpenChange={setCreating}
        action={saveExpenseCategory}
      >
        {(state) => <CategoryFields state={state} />}
      </ActionDialog>
      <ActionDialog
        title={me.settings.editCategory}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        action={saveExpenseCategory}
      >
        {(state) =>
          editing ? <CategoryFields state={state} category={editing} /> : null
        }
      </ActionDialog>
    </section>
  );
}

function CategoryFields({
  state,
  category,
}: {
  state: { fieldErrors?: Record<string, string> };
  category?: Category;
}) {
  return (
    <>
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <div className="grid gap-1.5">
        <Label htmlFor="category-name">{me.settings.categoryName}</Label>
        <Input
          id="category-name"
          name="name"
          defaultValue={category?.name ?? ""}
          required
        />
        <FieldError id="category-name-error">
          {state.fieldErrors?.name}
        </FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={category?.is_active ?? true}
          disabled={category?.is_system}
          className="size-4"
        />
        {me.settings.active}
      </label>
      {/* BR-131: a system category stays active, so its checkbox is fixed. */}
      {category?.is_system ? (
        <input type="hidden" name="isActive" value="true" />
      ) : null}
    </>
  );
}
