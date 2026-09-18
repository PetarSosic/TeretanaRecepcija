"use client";

import { useState } from "react";
import { FieldError } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { saveProduct } from "../catalog-actions";
import { ActionDialog } from "./action-dialog";

export type Product = {
  id: string;
  name: string;
  current_purchase_price: string;
  sale_price: string;
  is_active: boolean;
};

/** S-26. BR-140: products and both prices belong to the owner. */
export function ProductsScreen({ products }: { products: Product[] }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {me.settings.productsTitle}
        </h1>
        <Button onClick={() => setCreating(true)}>
          {me.settings.addProduct}
        </Button>
      </div>

      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.settings.productName}</Th>
              <Th>{me.settings.purchasePrice}</Th>
              <Th>{me.settings.salePrice}</Th>
              <Th>{me.settings.active}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <Td colSpan={5} className="text-muted-foreground">
                  {me.settings.empty}
                </Td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id}>
                  <Td className="font-medium">{product.name}</Td>
                  <Td>{formatMoney(product.current_purchase_price)}</Td>
                  <Td>{formatMoney(product.sale_price)}</Td>
                  <Td>{product.is_active ? me.users.yes : me.users.no}</Td>
                  <Td className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(product)}
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
        title={me.settings.addProduct}
        description={me.settings.priceChangeNotice}
        open={creating}
        onOpenChange={setCreating}
        action={saveProduct}
      >
        {(state) => <ProductFields state={state} />}
      </ActionDialog>
      <ActionDialog
        title={me.settings.editProduct}
        description={me.settings.priceChangeNotice}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        action={saveProduct}
      >
        {(state) =>
          editing ? <ProductFields state={state} product={editing} /> : null
        }
      </ActionDialog>
    </>
  );
}

function ProductFields({
  state,
  product,
}: {
  state: { fieldErrors?: Record<string, string> };
  product?: Product;
}) {
  return (
    <>
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <div className="grid gap-1.5">
        <Label htmlFor="product-name">{me.settings.productName}</Label>
        <Input
          id="product-name"
          name="name"
          defaultValue={product?.name ?? ""}
          required
        />
        <FieldError id="product-name-error">
          {state.fieldErrors?.name}
        </FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="product-purchase">{me.settings.purchasePrice}</Label>
        <Input
          id="product-purchase"
          name="purchasePrice"
          inputMode="decimal"
          defaultValue={product?.current_purchase_price ?? ""}
          required
        />
        <FieldError id="product-purchase-error">
          {state.fieldErrors?.purchasePrice}
        </FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="product-sale">{me.settings.salePrice}</Label>
        <Input
          id="product-sale"
          name="salePrice"
          inputMode="decimal"
          defaultValue={product?.sale_price ?? ""}
          required
        />
        <FieldError id="product-sale-error">
          {state.fieldErrors?.salePrice}
        </FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={product?.is_active ?? true}
          className="size-4"
        />
        {me.settings.active}
      </label>
    </>
  );
}
