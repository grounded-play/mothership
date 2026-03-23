// Sound Manager for Mothership
// Uses Web Audio API for card interactions
export const soundManager = {
    enabled: true,
    volume: 0.3,

    // Audio context and oscillators
    ctx: null as AudioContext | null,

    // Initialize audio context (requires user interaction first)
    init() {
        if (typeof window === 'undefined') return;
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    },

    // Play a beep tone with specified parameters
    playTone(freq: number, duration: number, type: OscillatorType = "sine", userVolume?: number) {
        const finalVolume = userVolume ?? this.volume;
        if (!this.enabled || !this.ctx) return;

        const oscillator = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gainNode.gain.setValueAtTime(finalVolume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        oscillator.start(this.ctx.currentTime);
        oscillator.stop(this.ctx.currentTime + duration);
    },

    // Card Play Sound - Subtle sci-fi chime
    cardPlay() {
        if (!this.enabled) return;
        this.init();

        // Main tone
        this.playTone(880, 0.15, "sine", this.volume * 0.8);

        // Harmonic tone (slightly lower)
        setTimeout(() => {
            this.playTone(1100, 0.1, "sine", this.volume * 0.4);
        }, 50);
    },

    // Card Select Sound - Short click
    cardSelect() {
        if (!this.enabled) return;
        this.init();

        this.playTone(220, 0.05, "triangle", this.volume * 0.6);
    },

    // Action Success Sound - Pleasant ascending tone
    actionSuccess() {
        if (!this.enabled) return;
        this.init();

        this.playTone(523.25, 0.1, "sine", this.volume * 0.7); // C5
        setTimeout(() => this.playTone(659.25, 0.1, "sine", this.volume * 0.7), 80); // E5
        setTimeout(() => this.playTone(783.99, 0.15, "sine", this.volume * 0.7), 160); // G5
    },

    // Action Fail Sound - Lower, dissonant tone
    actionFail() {
        if (!this.enabled) return;
        this.init();

        this.playTone(165, 0.1, "sawtooth", this.volume * 0.5); // G3
        setTimeout(() => this.playTone(146, 0.15, "sawtooth", this.volume * 0.3), 80); // F3
    },

    // Toggle sound on/off
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    },

    // Set volume level (0-1)
    setVolume(vol: number) {
        this.volume = Math.max(0, Math.min(1, vol));
    }
};
