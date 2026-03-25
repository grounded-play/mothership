export const CLASS_SUIT_MAP: Record<string, "COMMAND" | "BIOTECH" | "PLASMA" | "VOID"> = {
    marine: "COMMAND",
    command: "COMMAND",
    medic: "BIOTECH",
    biotech: "BIOTECH",
    engineer: "PLASMA",
    plasma: "PLASMA",
    scout: "VOID",
    void: "VOID"
};

export const getClassSuit = (className?: string | null) => {
    if (!className) return "COMMAND";
    const key = className.toLowerCase();
    return CLASS_SUIT_MAP[key] || "COMMAND";
};
