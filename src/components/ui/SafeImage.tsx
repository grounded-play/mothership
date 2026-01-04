"use client";

import { useEffect, useState, type ReactNode } from "react";
import { normalizePublicPath } from "@/lib/imagePath";

type SafeImageProps = {
    src?: string | null;
    fallbackSrc?: string | null;
    alt?: string;
    className?: string;
    fallback?: ReactNode;
};

export default function SafeImage({ src, fallbackSrc, alt, className, fallback }: SafeImageProps) {
    const normalizedSrc = normalizePublicPath(src);
    const normalizedFallback = normalizePublicPath(fallbackSrc);
    const [currentSrc, setCurrentSrc] = useState<string | null>(normalizedSrc || normalizedFallback);

    useEffect(() => {
        setCurrentSrc(normalizedSrc || normalizedFallback);
    }, [normalizedSrc, normalizedFallback]);

    if (!currentSrc) {
        return <>{fallback ?? null}</>;
    }

    return (
        <img
            src={currentSrc}
            alt={alt || ""}
            className={className}
            onError={() => {
                if (currentSrc !== normalizedFallback && normalizedFallback) {
                    setCurrentSrc(normalizedFallback);
                } else {
                    setCurrentSrc(null);
                }
            }}
        />
    );
}
