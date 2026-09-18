"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import { useActionToast } from "@/components/common/use-action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import { formatDate } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { generateCardBatch } from "../cards-actions";

export type Batch = {
  id: string;
  created_at: string;
  quantity: number;
  /** US-03.1 AC3: how many of the batch are still unassigned. */
  unassigned: number;
};

/** S-28. P-64: owners, managers and admins generate and print card batches. */
export function CardsScreen({ batches }: { batches: Batch[] }) {
  const [state, action, pending] = useActionState(generateCardBatch, idleState);
  useActionToast(state);

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        {me.cards.title}
      </h1>

      <form action={action} className="mb-8 grid max-w-xs gap-2" noValidate>
        <FormError>{state.error}</FormError>
        <Label htmlFor="quantity">{me.cards.quantity}</Label>
        <Input
          id="quantity"
          name="quantity"
          inputMode="numeric"
          defaultValue="100"
          required
          aria-invalid={Boolean(state.fieldErrors?.quantity)}
          aria-describedby="quantity-error"
        />
        <FieldError id="quantity-error">
          {state.fieldErrors?.quantity}
        </FieldError>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {me.cards.generate}
          </Button>
        </div>
      </form>

      <h2 className="mb-3 text-lg font-semibold">{me.cards.batches}</h2>
      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.cards.columnDate}</Th>
              <Th>{me.cards.columnQuantity}</Th>
              <Th>{me.cards.columnUnassigned}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr>
                <Td colSpan={4} className="text-muted-foreground">
                  {me.cards.empty}
                </Td>
              </tr>
            ) : (
              batches.map((batch) => (
                <tr key={batch.id}>
                  <Td>{formatDate(batch.created_at)}</Td>
                  <Td>{batch.quantity}</Td>
                  <Td>{batch.unassigned}</Td>
                  <Td className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/pdf/cards/${batch.id}`}>
                        {me.cards.download}
                      </a>
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrapper>
    </>
  );
}
