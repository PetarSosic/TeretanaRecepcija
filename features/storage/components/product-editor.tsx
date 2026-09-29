"use client";

import { FieldError } from "@/components/common/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { me } from "@/lib/i18n/me";
import { ActionDialog } from "@/features/settings/components/action-dialog";
import { saveProduct } from "@/features/settings/catalog-actions";

export type EditableProduct = {
  id: string;
  name: string;
  /** Decimal text, as numeric(10,2) arrives (BR-003). */
  current_purchase_price: string;
  sale_price: string;
  is_active: boolean;
};

/**
 * S-13 (D-76): [Dodaj proizvod] with no product, [Uredi] with one. Every role but the
 * receptionist sets the name, both prices and whether the product is active (P-42,
 * BR-140); upsert_product checks the role again.
 */
export function ProductDialog({
  product,
  open,
  onOpenChange,
}: {
  product: EditableProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ActionDialog
      title={product ? me.settings.editProduct : me.settings.addProduct}
      description={me.settings.priceChangeNotice}
      open={open}
      onOpenChange={onOpenChange}
      action={saveProduct}
    >
      {(state) => <ProductFields state={state} product={product} />}
    </ActionDialog>
  );
}

function ProductFields({
  state,
  product,
}: {
  state: { fieldErrors?: Record<string, string> };
  product: EditableProduct | null;
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
