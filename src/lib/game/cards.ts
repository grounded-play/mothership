
export interface Card {
    id: string;
    suit: "COMMAND" | "VOID" | "BIOTECH" | "PLASMA" | "ANOMALY";
    rank: number; // 3-15 (11=J, 12=Q, 13=K, 14=A, 15=2) for simplified comparison? Or standard 1-13 remapped.
    // User said: 3 is lowest. 2 is highest. 
    // Let's use "Power" for comparison logic (3=3 ... A=14, 2=15).
    power: number;
    name: string;
    description: string;
    deckId: number; // 0 or 1 (since we have 2 decks)
}

export class DeckGenerator {
    static generateDeck(): Card[] {
        const suits: ("COMMAND" | "VOID" | "BIOTECH" | "PLASMA")[] = ["COMMAND", "VOID", "BIOTECH", "PLASMA"];
        const deck: Card[] = [];

        // 2 Decks
        for (let d = 0; d < 2; d++) {
            for (const suit of suits) {
                for (let rank = 1; rank <= 13; rank++) { // 1(A)..13(K)
                    // Determine Power based on President Rules
                    // 3 is lowest (3). 4 is 4...
                    // A is high (14).
                    // 2 is highest (15).

                    let power = rank;
                    if (rank === 1) power = 14;      // Ace
                    else if (rank === 2) power = 15; // Two
                    else power = rank;               // 3-13 maps naturally? No.
                    // Wait, standard rank: 3,4,5,6,7,8,9,10,J(11),Q(12),K(13).
                    // So 3=3, ... K=13. 
                    // Ace(1) -> 14. 
                    // Two(2) -> 15.
                    // This mapping works.

                    // UNIQUE START KEY RULE: Only one 3 of COMMAND allowed globally
                    if (rank === 3 && suit === "COMMAND" && d > 0) {
                        continue;
                    }

                    deck.push({
                        id: crypto.randomUUID(),
                        suit,
                        rank,
                        power,
                        name: this.getCardName(rank, suit),
                        description: this.getFlavorText(suit),
                        deckId: d
                    });
                }
            }
            // Add Jokers? User mentioned Joker beats 2. 
            // Standard deck usually has 2 jokers. 2 decks = 4 jokers.
            deck.push({ id: crypto.randomUUID(), suit: "ANOMALY", rank: 99, power: 16, name: "Red Anomaly", description: "The God Killer", deckId: d });
            deck.push({ id: crypto.randomUUID(), suit: "ANOMALY", rank: 99, power: 16, name: "Black Anomaly", description: "The God Killer", deckId: d });
        }
        return this.shuffle(deck);
    }

    static shuffle(deck: Card[]): Card[] {
        return deck.sort(() => Math.random() - 0.5);
    }

    static getCardName(rank: number, suit: string): string {
        // Sci-Fi Ranks? Or standard? User didn't specify rank rename, just types.
        // Let's keep names but maybe spice them up later.
        if (rank === 1) return "Ace of " + suit;
        if (rank === 11) return "Jack of " + suit;
        if (rank === 12) return "Queen of " + suit;
        if (rank === 13) return "King of " + suit;
        if (rank === 2) return "Two of " + suit;
        return `${rank} of ${suit}`;
    }

    static getFlavorText(suit: string): string {
        switch (suit) {
            case "BIOTECH": return "Life Support & Biologicals";
            case "PLASMA": return "High Value Assets";
            case "COMMAND": return "Engineering & Infrastructure";
            case "VOID": return "Security & Power Systems";
            default: return "Unknown";
        }
    }
}

export class CardRules {
    static getSuitValue(suit: string): number {
        // Hierarchy: Command (0) < Biotech (1) < Plasma (2) < Void (3) < Anomaly (4)
        switch (suit) {
            case "COMMAND": return 0;
            case "BIOTECH": return 1;
            case "PLASMA": return 2;
            case "VOID": return 3;
            case "ANOMALY": return 4;
            default: return 0;
        }
    }

    static getCardPower(card: Card, roomType: string | null = null): number {
        let val = card.power * 10 + this.getSuitValue(card.suit);

        // Room Bonus (+2 Rank equivalent = +20 Power)
        if (roomType && roomType.includes(card.suit)) {
            val += 20;
        }
        return val;
    }

    static sortHand(hand: Card[], roomType: string | null = null): Card[] {
        return hand.sort((a, b) => {
            // High to Low
            return this.getCardPower(b, roomType) - this.getCardPower(a, roomType);
        });
    }

    static isValidAction(selected: Card[], pile: Card[], roomType: string | null = null): { valid: boolean, error?: string } {
        if (selected.length === 0) return { valid: false, error: "No cards selected" };

        // 1. Check Homogeneity (All selected must be same rank)
        const first = selected[0];
        if (!selected.every(c => c.rank === first.rank)) {
            return { valid: false, error: "Protocol Mismatch: Ranks must match." };
        }

        // 2. Check Pile
        if (pile.length === 0) return { valid: true }; // Lead whatever

        const top = pile[pile.length - 1]; // Visual top is last

        // Infer active combo count from top of pile
        let pileRankCount = 0;
        for (let i = pile.length - 1; i >= 0; i--) {
            if (pile[i].rank === top.rank) pileRankCount++;
            else break;
        }

        const selectedPower = this.getCardPower(first, roomType);
        const topPower = this.getCardPower(top, roomType);

        if (selected.length > pileRankCount) {
            // Power Play (Double vs Single, Triple vs Double)
            // Always wins? "Double of any card beats the highest single".
            // Yes.
            return { valid: true };
        }

        if (selected.length < pileRankCount) {
            return { valid: false, error: `Insufficient Firepower: Need ${pileRankCount} cards.` };
        }

        // Equal Count: Must Beat Power
        if (selectedPower > topPower) {
            return { valid: true };
        }

        return { valid: false, error: "Signal Weak: Card Power too low." };
    }
}
