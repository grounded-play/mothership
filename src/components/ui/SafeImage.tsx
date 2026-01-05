"use client";

import { useState } from "react";
import { normalizePublicPath } from "@/lib/imagePath";

type SafeImageProps = {
    src?: string | null;
    alt: string;
    className?: string;
    fallback?: React.ReactNode;
};

export default function SafeImage({ src, alt, className, fallback }: SafeImageProps) {
    const [failed, setFailed] = useState(false);
    const normalized = normalizePublicPath(src);

    if (!normalized || failed) {
        return <>{fallback ?? <span className="text-xs text-gray-500">NO IMG</span>}</>;
    }

    return (
        <img
            src={normalized}
            alt={alt}
            className={className}
            onError={() => setFailed(true)}
        />
    );
}
