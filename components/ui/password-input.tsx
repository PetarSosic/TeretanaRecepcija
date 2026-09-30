"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";

/**
 * D-82: a password field with an eye button at its right edge, so staff can check what
 * they typed. The button only switches what the field shows; the value is sent as it
 * always was. Every other prop goes to the input, so labels and errors work unchanged.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? me.password.hide : me.password.show}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground disabled:opacity-60 [&_svg]:size-4"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}
