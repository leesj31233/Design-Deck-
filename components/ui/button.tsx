import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium tracking-[-0.01em] transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 active:scale-[.985] dd-focus",
  {
    variants: {
      variant: {
        primary: "border border-transparent bg-[var(--foreground)] text-[var(--background)] shadow-sm hover:opacity-90",
        accent: "border border-transparent bg-[var(--accent)] text-white shadow-sm hover:brightness-105",
        secondary: "border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:bg-white/90 dark:hover:bg-white/10",
        ghost: "border border-transparent bg-transparent text-[var(--foreground)] hover:bg-black/[.055] dark:hover:bg-white/[.075]",
        danger: "border border-transparent bg-[var(--danger)] text-white hover:brightness-105"
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-sm rounded-[14px]",
        icon: "size-10 p-0"
      }
    },
    defaultVariants: { variant: "secondary", size: "md" }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
