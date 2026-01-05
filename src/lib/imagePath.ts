export const normalizePublicPath = (value?: string | null) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) return trimmed;

    let normalized = trimmed.replace(/\\/g, "/");
    const lower = normalized.toLowerCase();
    const publicIndex = lower.lastIndexOf("/public/");
    if (publicIndex !== -1) {
        normalized = normalized.slice(publicIndex + "/public".length);
    } else if (lower.startsWith("public/")) {
        normalized = normalized.slice("public".length);
    }

    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }

    return normalized;
};
