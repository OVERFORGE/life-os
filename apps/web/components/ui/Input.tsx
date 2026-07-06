import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = "", ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`flex h-10 w-full rounded-[var(--radius-md)] bg-[var(--color-alpha-white5)] px-4 py-2 text-[var(--text-sm)] text-[var(--color-text-primary)] transition-all duration-200 ring-1 ring-inset ring-transparent file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-[var(--color-brand-primary)] focus:bg-[var(--color-alpha-white10)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
});
Input.displayName = "Input";
