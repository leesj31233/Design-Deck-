import * as React from "react";
import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  label: string;
  size?: "sm" | "md" | "lg";
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({ label, size = "md", className, ...props }, ref) => {
  const sizes = { sm: "size-8", md: "size-10", lg: "size-12" };
  return <Button ref={ref} size="icon" aria-label={label} title={label} className={cn(sizes[size], className)} {...props} />;
});
IconButton.displayName = "IconButton";
