import { Input as InputPrimitive } from "@base-ui/react/input";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "cnfast";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function Input({ className, type, ...props }, ref) {
    return (
      <InputPrimitive
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "min-h-11 w-full min-w-0 rounded-3xl border border-transparent bg-[color-mix(in_oklch,var(--input),transparent_50%)] px-4 py-2.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
          className,
        )}
        {...props}
      />
    );
  },
);
