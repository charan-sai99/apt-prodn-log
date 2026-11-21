import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand text-white hover:bg-brand-hover",
        navy: "bg-navy-900 text-white hover:bg-navy-800",
        outline: "border border-line bg-surface text-ink hover:bg-canvas",
        ghost: "text-ink hover:bg-slate-100",
        success: "bg-success text-white hover:bg-green-700",
        danger: "bg-danger text-white hover:bg-red-700",
        "danger-outline": "border border-red-200 bg-danger-50 text-danger hover:bg-red-100",
        link: "text-brand underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        default: "h-11 px-4 text-sm",
        lg: "h-14 px-6 text-base",
        xl: "h-16 px-6 text-lg",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
