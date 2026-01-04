export const normalizePublicPath = (input?: string | null) => {
    if (!input) return null;
    const trimmed = String(input).trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) return trimmed;

    let normalized = trimmed.replace(/\\/g, "/");
    const publicMatch = normalized.match(/(?:^|\/)public\/(.+)/);
    if (publicMatch?.[1]) {
        normalized = `/${publicMatch[1]}`;
    }
    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }
    return normalized;
};
