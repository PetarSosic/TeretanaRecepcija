"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";

// D-47: Radix traps focus and closes on Esc (doc 06 §1).
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  // UX-04 (N-26): Radix hands focus back only to a <DialogTrigger>, and almost every
  // dialog here opens from state, so closing one dropped focus onto <body>. Focus goes
  // back to the control that opened it — never to a text field, where it would catch
  // the next card scan at the desk (REC-15).
  const opener = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border bg-card p-6 shadow-lg",
          className,
        )}
        onOpenAutoFocus={(event) => {
          const active = document.activeElement;
          opener.current =
            active instanceof HTMLElement &&
            active !== document.body &&
            !active.closest("input, textarea, select, [contenteditable=true]")
              ? active
              : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented || !opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus();
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 rounded-md p-1 hover:bg-muted">
          <X aria-hidden="true" className="size-4" />
          <span className="sr-only">{me.common.close}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-1.5", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

/**
 * Radix gives the description its own id and points the content's `aria-describedby`
 * at it. With `asChild` the description is an element the screen already shows — a list
 * of details, say — which then keeps its own styling instead of this one.
 */
export function DialogDescription({
  className,
  asChild,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      asChild={asChild}
      className={
        asChild ? className : cn("text-sm text-muted-foreground", className)
      }
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}
