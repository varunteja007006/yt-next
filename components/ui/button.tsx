import * as React from "react";

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm";
};

const variantClasses = {
  default: "button-primary",
  outline: "button-outline",
  secondary: "button-secondary",
  ghost: "button-ghost",
};

const sizeClasses = {
  default: "button-default",
  sm: "button-small",
};

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={`${variantClasses[variant]} ${sizeClasses[size]} ${className ?? ""}`}
      {...props}
    />
  );
}

export { Button };
