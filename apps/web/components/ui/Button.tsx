import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
};

export function Button({ variant = "primary", size = "md", className = "", children, ...props }: ButtonProps) {
  
  const baseStyles = "inline-flex items-center justify-center font-[var(--font-medium)] rounded-[var(--radius-md)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-alpha-white20)] disabled:opacity-50 disabled:cursor-not-allowed select-none";
  
  const variants = {
    primary: "bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-brand-dark)] shadow-sm",
    secondary: "bg-[var(--color-bg-workspace)] text-[var(--color-text-primary)] hover:bg-[var(--color-alpha-white5)] border border-[var(--color-border-default)] shadow-sm",
    outline: "bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-alpha-white5)] border border-[var(--color-border-default)] hover:border-[var(--color-text-muted)]",
    ghost: "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-alpha-white5)]"
  };
  
  const sizes = {
    sm: "h-8 px-3 text-[var(--text-sm)]",
    md: "h-10 px-4 text-[var(--text-sm)]", 
    lg: "h-12 px-6 text-[var(--text-base)]"
  };

  return (
    <button className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}
