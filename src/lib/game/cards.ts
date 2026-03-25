
export interface Card {
    id: string;
    suit: "COMMAND" | "VOID" | "BIOTECH" | "PLASMA" | "ANOMALY";
    rank: number; // 1-9 for normal cards
    power: number; // effective combat power
    name: string;
    description: string;
    deckId: number;
    effects?: CardEffect[]; // Tactical variety
}

interface CardEffect {
    type: "attack" | "defense" | "utility" | "scouting" | "loot";
    value: number;
    description: string;
}

export class DeckGenerator {
    static generateDeck(): Card[] {
        const suits: ("COMMAND" | "VOID" | "BIOTECH" | "PLASMA")[] = ["COMMAND", "VOID", "BIOTECH", "PLASMA"];
        const deck: Card[] = [];

        // Two decks of 1-9 per suit
        for (let d = 0; d < 2; d++) {
            for (const suit of suits) {
                for (let rank = 1; rank <= 9; rank++) {
                    const power = this.getCardPower(rank);
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
            // Two high jokers per deck
            deck.push({ id: crypto.randomUUID(), suit: "ANOMALY", rank: 99, power: 20, name: "Red Anomaly", description: "Chaos wildcard", deckId: d });
            deck.push({ id: crypto.randomUUID(), suit: "ANOMALY", rank: 99, power: 20, name: "Black Anomaly", description: "Chaos wildcard", deckId: d });
        }
        return this.shuffle(deck);
    }

    static shuffle(deck: Card[]): Card[] {
        return deck.sort(() => Math.random() - 0.5);
    }

    static getCardName(rank: number, suit: string): string {
        if (rank === 99) return suit === "ANOMALY" ? "Joker" : "Anomaly";
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

    static getCardPower(rank: number): number {
        // Non-linear curve: 9s are significantly stronger than 1s
        // Power = sqrt(rank) * 10 + base (weighted toward higher ranks)
        return Math.floor(Math.sqrt(rank) * 15);
    }

    static getDepthMultiplier(depth: number): number {
        // Small bonus for deeper rooms: 1.0x at start, 1.3x at depth 10, 1.5x at depth 20+
        if (depth < 10) return 1.0;
        if (depth < 20) return 1.15 + (depth - 10) * 0.015;
        return 1.3 + Math.min(depth - 20, 10) * 0.02;
    }
}

export class CardRules {
    static getSuitValue(suit: string): number {
        switch (suit) {
            case "COMMAND": return 0;
            case "BIOTECH": return 1;
            case "PLASMA": return 2;
            case "VOID": return 3;
            case "ANOMALY": return 4;
            default: return 0;
        }
    }

    static getCardPower(card: Card, roomType: string | null = null, depth: number = 0): number {
        let val = card.power * 10;

        // Depth scaling
        const depthMult = DeckGenerator.getDepthMultiplier(depth);
        val = Math.floor(val * depthMult);

        // Suit value (improved: COMMAND now has value)
        val += this.getSuitValue(card.suit);

        // Room bonus - tighter (+3-5 instead of +10)
        if (roomType && roomType.includes(card.suit)) {
            val += 5;
        }

        return val;
    }

    static sortHand(hand: Card[], roomType: string | null = null, depth: number = 0): Card[] {
        return hand.sort((a, b) => {
            return this.getCardPower(b, roomType, depth) - this.getCardPower(a, roomType, depth);
        });
    }
}
