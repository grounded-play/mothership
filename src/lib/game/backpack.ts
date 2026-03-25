export const getBackpackCapacity = (level?: number | null) => {
    if (level === 2) return 6;
    if (level === 3) return 8;
    return 4;
};
