
export interface Card {
    id: string;
    suit: "COMMAND" | "VOID" | "BIOTECH" | "PLASMA" | "ANOMALY";
    rank: number; // 1-9 for normal cards
    power: number; // align to rank for simplicity; jokers are high
    name: string;
    description: string;
    deckId: number;
}

export class DeckGenerator {
    static generateDeck(): Card[] {
        const suits: ("COMMAND" | "VOID" | "BIOTECH" | "PLASMA")[] = ["COMMAND", "VOID", "BIOTECH", "PLASMA"];
        const deck: Card[] = [];

        // Two decks of 1-9 per suit
        for (let d = 0; d < 2; d++) {
            for (const suit of suits) {
                for (let rank = 1; rank <= 9; rank++) {
                    deck.push({
                        id: crypto.randomUUID(),
                        suit,
                        rank,
                        power: rank,
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

    static getCardPower(card: Card, roomType: string | null = null): number {
        let val = card.power * 10 + this.getSuitValue(card.suit);
        if (roomType && roomType.includes(card.suit)) {
            val += 10; // +1 effective rank
        }
        return val;
    }

    static sortHand(hand: Card[], roomType: string | null = null): Card[] {
        return hand.sort((a, b) => {
            return this.getCardPower(b, roomType) - this.getCardPower(a, roomType);
        });
    }
}
