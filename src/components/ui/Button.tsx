import { ButtonHTMLAttributes, forwardRef } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", ...props }, ref) => {
        const variants = {
            primary: "bg-neon-cyan/10 border-neon-cyan text-neon-cyan hover:bg-neon-cyan/20 hover:shadow-[0_0_15px_rgba(0,243,255,0.4)]",
            secondary: "bg-neon-magenta/10 border-neon-magenta text-neon-magenta hover:bg-neon-magenta/20 hover:shadow-[0_0_15px_rgba(255,0,255,0.4)]",
            danger: "bg-red-500/10 border-red-500 text-red-500 hover:bg-red-500/20",
            ghost: "bg-transparent border-transparent text-gray-400 hover:text-white",
            outline: "bg-transparent border-white/20 text-white hover:bg-white/10",
        };

        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-space-black disabled:opacity-50 disabled:cursor-not-allowed",
                    variants[variant],
                    className
                )}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button, cn };
