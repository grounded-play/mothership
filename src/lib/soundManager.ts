export type AudioSettingsSnapshot = {
    masterEnabled: boolean;
    musicEnabled: boolean;
    sfxEnabled: boolean;
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
};

type CardAudio = {
    suit?: string;
    rank?: number;
};

type SuitProfile = {
    root: number;
    wave: OscillatorType;
    accent: number;
};

export type MusicScene = "silent" | "default" | "intense";
export type MusicTrack = "default" | "intense";

export type MusicTrackMeta = {
    id: MusicTrack;
    title: string;
    subtitle: string;
    scene: Exclude<MusicScene, "silent">;
};

export type MusicPlayerSnapshot = {
    tracks: MusicTrackMeta[];
    currentTrack: MusicTrackMeta | null;
    currentTrackId: MusicTrack | null;
    playlistIndex: number;
    playlistSize: number;
    scene: MusicScene;
    isPlaying: boolean;
    isPaused: boolean;
    unlocked: boolean;
    currentTime: number;
    duration: number;
    progress: number;
    musicEnabled: boolean;
    masterEnabled: boolean;
    musicVolume: number;
};

const SUIT_AUDIO: Record<string, SuitProfile> = {
    COMMAND: { root: 261.63, wave: "square", accent: 0 },
    VOID: { root: 311.13, wave: "triangle", accent: -2 },
    BIOTECH: { root: 349.23, wave: "sine", accent: 2 },
    PLASMA: { root: 392.0, wave: "sawtooth", accent: 5 },
    ANOMALY: { root: 466.16, wave: "triangle", accent: 9 }
};

const RANK_INTERVALS = [0, 2, 3, 5, 7, 8, 10, 12, 14];
const STORAGE_KEY = "mothership.audio.settings.v2";
const PLAYBACK_STATE_KEY = "mothership.audio.playback.v1";
const UNLOCK_STATE_KEY = "mothership.audio.unlocked.v1";
const MUSIC_CROSSFADE_MS = 1100;
const MUSIC_TRACK_PATHS: Record<MusicTrack, string> = {
    default: "/audio/default.mp3",
    intense: "/audio/intense.mp3"
};
const MUSIC_TRACK_LIBRARY: Record<MusicTrack, MusicTrackMeta> = {
    default: {
        id: "default",
        title: "Bridge Drift",
        subtitle: "Ambient Deck Loop",
        scene: "default"
    },
    intense: {
        id: "intense",
        title: "Combat Surge",
        subtitle: "Mission Pressure Loop",
        scene: "intense"
    }
};
const MUSIC_TRACK_ORDER: MusicTrack[] = ["default", "intense"];
export const DEFAULT_AUDIO_SETTINGS: AudioSettingsSnapshot = {
    masterEnabled: true,
    musicEnabled: true,
    sfxEnabled: true,
    masterVolume: 0.72,
    musicVolume: 0.58,
    sfxVolume: 0.7
};

class MothershipSoundManager {
    private settings: AudioSettingsSnapshot = { ...DEFAULT_AUDIO_SETTINGS };
    private settingsLoaded = false;
    private listeners = new Set<(settings: AudioSettingsSnapshot) => void>();
    private musicScene: MusicScene = "silent";
    private musicElements: Partial<Record<MusicTrack, HTMLAudioElement>> = {};
    private musicFadeFrame: number | null = null;
    private unlockListenersBound = false;
    private primedAutoplay = false;
    private playbackStateRestored = false;
    private initialized = false;
    private manualTrackOverride: MusicTrack | null = null;
    private musicPaused = false;
    private musicUnlocked = false;

    ctx: AudioContext | null = null;

    get enabled() {
        return this.settings.masterEnabled && this.settings.sfxEnabled;
    }

    get volume() {
        return this.settings.sfxVolume;
    }

    init() {
        if (typeof window === "undefined") return;

        this.loadSettings();
        this.musicUnlocked = this.musicUnlocked || window.sessionStorage.getItem(UNLOCK_STATE_KEY) === "1";
        this.ensureAudioContext();
        this.ensureMusicElements();
        if (this.initialized) return;
        this.initialized = true;
        this.restorePlaybackState();
        this.primeMusicAutoplay();
        this.bindUnlockListeners();
        this.resumeAudio();
        this.syncMusicLevels(true);
    }

    registerMusicElements(elements: Partial<Record<MusicTrack, HTMLAudioElement>>) {
        Object.entries(elements).forEach(([track, element]) => {
            if (!element) return;
            this.configureMusicElement(track as MusicTrack, element);
            this.musicElements[track as MusicTrack] = element;
        });
        this.syncMusicLevels(true);
    }

    getSettingsSnapshot() {
        this.loadSettings();
        return { ...this.settings };
    }

    getMusicPlayerSnapshot(): MusicPlayerSnapshot {
        if (typeof window !== "undefined") {
            this.init();
        }

        const currentTrackId = this.getCurrentTrackId();
        const currentTrack = currentTrackId ? MUSIC_TRACK_LIBRARY[currentTrackId] : null;
        const currentAudio = currentTrackId ? this.musicElements[currentTrackId] : null;
        const currentTime = Number.isFinite(currentAudio?.currentTime) ? Number(currentAudio?.currentTime ?? 0) : 0;
        const duration = Number.isFinite(currentAudio?.duration) ? Number(currentAudio?.duration ?? 0) : 0;
        const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

        return {
            tracks: MUSIC_TRACK_ORDER.map((track) => MUSIC_TRACK_LIBRARY[track]),
            currentTrack,
            currentTrackId,
            playlistIndex: currentTrackId ? Math.max(0, MUSIC_TRACK_ORDER.indexOf(currentTrackId)) : 0,
            playlistSize: MUSIC_TRACK_ORDER.length,
            scene: this.musicScene,
            isPlaying: Boolean(
                currentTrackId
                && this.musicUnlocked
                && !this.musicPaused
                && this.settings.masterEnabled
                && this.settings.musicEnabled
                && currentAudio
                && !currentAudio.paused
            ),
            isPaused: this.musicPaused,
            unlocked: this.musicUnlocked,
            currentTime,
            duration,
            progress,
            musicEnabled: this.settings.musicEnabled,
            masterEnabled: this.settings.masterEnabled,
            musicVolume: this.settings.masterVolume * this.settings.musicVolume
        };
    }

    subscribe(listener: (settings: AudioSettingsSnapshot) => void) {
        this.loadSettings();
        this.listeners.add(listener);
        listener(this.getSettingsSnapshot());
        return () => {
            this.listeners.delete(listener);
        };
    }

    private loadSettings() {
        if (this.settingsLoaded || typeof window === "undefined") return;
        this.settingsLoaded = true;

        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return;
            this.settings = {
                ...DEFAULT_AUDIO_SETTINGS,
                ...Object.fromEntries(
                    Object.entries(parsed).filter(([key, value]) => key in DEFAULT_AUDIO_SETTINGS && typeof value === typeof (DEFAULT_AUDIO_SETTINGS as any)[key])
                )
            };
        } catch {
            this.settings = { ...DEFAULT_AUDIO_SETTINGS };
        }
    }

    private persistSettings() {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        }
        const snapshot = this.getSettingsSnapshot();
        this.listeners.forEach((listener) => listener(snapshot));
    }

    private ensureAudioContext() {
        if (typeof window === "undefined") return;
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }

    private configureMusicElement(track: MusicTrack, audio: HTMLAudioElement) {
        const expectedPath = MUSIC_TRACK_PATHS[track];
        const currentPath = audio.currentSrc
            ? new URL(audio.currentSrc, window.location.href).pathname
            : (audio.getAttribute("src") || "");
        if (currentPath !== expectedPath) {
            audio.src = expectedPath;
        }
        audio.autoplay = true;
        audio.loop = true;
        audio.preload = "auto";
        audio.setAttribute("playsinline", "true");
        if (!audio.dataset.mothershipAudioReady) {
            audio.muted = true;
            audio.volume = 0;
            audio.dataset.mothershipAudioReady = "1";
        }
    }

    private ensureMusicElements() {
        if (typeof window === "undefined") return;

        (Object.keys(MUSIC_TRACK_PATHS) as MusicTrack[]).forEach((track) => {
            const existing = this.musicElements[track];
            if (existing && existing.isConnected) {
                this.configureMusicElement(track, existing);
                return;
            }

            const elementId = `mothership-music-${track}`;
            let audio = document.getElementById(elementId) as HTMLAudioElement | null;
            if (!audio) {
                audio = document.createElement("audio");
                audio.id = elementId;
                audio.setAttribute("aria-hidden", "true");
                audio.style.position = "fixed";
                audio.style.width = "0";
                audio.style.height = "0";
                audio.style.opacity = "0";
                audio.style.pointerEvents = "none";
                audio.style.left = "-9999px";
                document.body.appendChild(audio);
            }
            this.configureMusicElement(track, audio);
            this.musicElements[track] = audio;
        });
    }

    private getCurrentTrackId(): MusicTrack | null {
        if (this.manualTrackOverride) return this.manualTrackOverride;
        if (this.musicScene === "default" || this.musicScene === "intense") return this.musicScene;
        return null;
    }

    private getStoredPlaybackState() {
        if (typeof window === "undefined") return null;
        try {
            const raw = window.sessionStorage.getItem(PLAYBACK_STATE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return null;
            return parsed as {
                scene?: MusicScene;
                times?: Partial<Record<MusicTrack, number>>;
                manualTrackOverride?: MusicTrack | null;
                paused?: boolean;
                unlocked?: boolean;
            };
        } catch {
            return null;
        }
    }

    private restorePlaybackState() {
        if (this.playbackStateRestored || typeof window === "undefined") return;
        this.playbackStateRestored = true;

        const snapshot = this.getStoredPlaybackState();
        if (!snapshot) return;

        if (snapshot.scene === "default" || snapshot.scene === "intense" || snapshot.scene === "silent") {
            this.musicScene = snapshot.scene;
        }
        if (snapshot.manualTrackOverride === "default" || snapshot.manualTrackOverride === "intense") {
            this.manualTrackOverride = snapshot.manualTrackOverride;
        }
        this.musicPaused = Boolean(snapshot.paused);
        this.musicUnlocked = Boolean(snapshot.unlocked);

        (Object.keys(MUSIC_TRACK_PATHS) as MusicTrack[]).forEach((track) => {
            const audio = this.musicElements[track];
            const nextTime = snapshot.times?.[track];
            if (!audio || !Number.isFinite(nextTime)) return;
            try {
                audio.currentTime = Math.max(0, Number(nextTime));
            } catch {
                return;
            }
        });
    }

    private persistPlaybackState() {
        if (typeof window === "undefined") return;
        try {
            const snapshot = {
                scene: this.musicScene,
                manualTrackOverride: this.manualTrackOverride,
                paused: this.musicPaused,
                unlocked: this.musicUnlocked,
                times: Object.fromEntries(
                    (Object.keys(MUSIC_TRACK_PATHS) as MusicTrack[]).map((track) => [
                        track,
                        Number.isFinite(this.musicElements[track]?.currentTime)
                            ? Number(this.musicElements[track]?.currentTime ?? 0)
                            : 0
                    ])
                )
            };
            window.sessionStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify(snapshot));
        } catch {
            return;
        }
    }

    private markUnlocked() {
        if (typeof window === "undefined") return;
        try {
            this.musicUnlocked = true;
            window.sessionStorage.setItem(UNLOCK_STATE_KEY, "1");
        } catch {
            return;
        }
    }

    private tryResumeFromLifecycle(markUnlocked = false) {
        this.resumeAudio();
        if (markUnlocked) {
            this.markUnlocked();
        }
        this.primeMusicAutoplay();
        this.syncMusicLevels(true);
    }

    private primeMusicAutoplay() {
        if (typeof window === "undefined" || this.primedAutoplay) return;

        this.ensureMusicElements();
        this.primedAutoplay = true;

        (Object.keys(MUSIC_TRACK_PATHS) as MusicTrack[]).forEach((track) => {
            const audio = this.musicElements[track];
            if (!audio) return;

            audio.muted = true;
            audio.volume = 0;
            audio.play().then(() => {
                this.persistPlaybackState();
            }).catch(() => {
                this.primedAutoplay = false;
            });
        });
    }

    private bindUnlockListeners() {
        if (this.unlockListenersBound || typeof window === "undefined") return;
        this.unlockListenersBound = true;

        const unlock = () => {
            this.tryResumeFromLifecycle(true);
        };
        const resume = () => {
            this.tryResumeFromLifecycle(false);
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                resume();
            }
        };
        const persist = () => {
            this.persistPlaybackState();
        };

        window.addEventListener("pointerdown", unlock, { passive: true });
        window.addEventListener("keydown", unlock);
        window.addEventListener("touchstart", unlock, { passive: true });
        window.addEventListener("focus", resume);
        window.addEventListener("pageshow", resume);
        window.addEventListener("pagehide", persist);
        window.addEventListener("beforeunload", persist);
        document.addEventListener("visibilitychange", onVisibilityChange);
    }

    private resumeAudio() {
        if (this.ctx?.state === "suspended") {
            this.ctx.resume().catch(() => undefined);
        }
    }

    private getSfxMixLevel() {
        if (!this.settings.masterEnabled || !this.settings.sfxEnabled) return 0;
        return this.settings.masterVolume * this.settings.sfxVolume;
    }

    private getMusicMixLevel() {
        if (!this.settings.masterEnabled || !this.settings.musicEnabled) return 0;
        return this.settings.masterVolume * this.settings.musicVolume;
    }

    private setTrackPlaying(track: MusicTrack) {
        const audio = this.musicElements[track];
        if (!audio) return;
        audio.muted = true;
        if (!audio.paused) return;
        audio.play().then(() => {
            this.persistPlaybackState();
        }).catch(() => undefined);
    }

    private finalizeSilentTracks(targetVolumes: Record<MusicTrack, number>) {
        const keepWarm = Boolean(this.getCurrentTrackId() && this.musicScene !== "silent" && this.getMusicMixLevel() > 0 && this.musicUnlocked && !this.musicPaused);
        (Object.keys(MUSIC_TRACK_PATHS) as MusicTrack[]).forEach((track) => {
            const audio = this.musicElements[track];
            if (!audio) return;

            if (targetVolumes[track] <= 0.0005) {
                audio.volume = 0;
                audio.muted = true;
                if (!keepWarm && !audio.paused) {
                    audio.pause();
                }
            }
        });
    }

    private syncMusicLevels(immediate = false) {
        if (typeof window === "undefined") return;

        this.ensureMusicElements();

        const targetVolumes: Record<MusicTrack, number> = {
            default: 0,
            intense: 0
        };
        const desiredLevel = this.getMusicMixLevel();
        const activeTrack = this.getCurrentTrackId();
        if (desiredLevel > 0 && activeTrack && this.musicUnlocked && !this.musicPaused) {
            targetVolumes[activeTrack] = desiredLevel;
        }

        const tracks = Object.keys(MUSIC_TRACK_PATHS) as MusicTrack[];
        const fromVolumes = Object.fromEntries(
            tracks.map((track) => [track, this.musicElements[track]?.volume ?? 0])
        ) as Record<MusicTrack, number>;

        const keepWarm = Boolean(activeTrack && this.musicScene !== "silent" && desiredLevel > 0 && this.musicUnlocked && !this.musicPaused);
        tracks.forEach((track) => {
            if (targetVolumes[track] > 0 || fromVolumes[track] > 0.0005) {
                this.setTrackPlaying(track);
            }
        });

        if (this.musicFadeFrame !== null) {
            window.cancelAnimationFrame(this.musicFadeFrame);
            this.musicFadeFrame = null;
        }

        if (immediate) {
            tracks.forEach((track) => {
                const audio = this.musicElements[track];
                if (!audio) return;
                audio.muted = targetVolumes[track] <= 0.0005;
                audio.volume = targetVolumes[track];
            });
            this.finalizeSilentTracks(targetVolumes);
            this.persistPlaybackState();
            return;
        }

        const start = window.performance.now();
        const step = (now: number) => {
            const progress = Math.min(1, (now - start) / MUSIC_CROSSFADE_MS);
            tracks.forEach((track) => {
                const audio = this.musicElements[track];
                if (!audio) return;
                const nextVolume = fromVolumes[track] + (targetVolumes[track] - fromVolumes[track]) * progress;
                audio.muted = nextVolume <= 0.0005;
                audio.volume = Math.max(0, nextVolume);
            });

            if (progress < 1) {
                this.musicFadeFrame = window.requestAnimationFrame(step);
                return;
            }

            this.musicFadeFrame = null;
            this.finalizeSilentTracks(targetVolumes);
            this.persistPlaybackState();
        };

        this.musicFadeFrame = window.requestAnimationFrame(step);
    }

    setMusicScene(scene: MusicScene) {
        this.init();
        if (this.musicScene === scene) {
            this.syncMusicLevels(true);
            return;
        }

        if (this.musicScene !== scene) {
            this.manualTrackOverride = null;
        }
        this.musicScene = scene;
        this.persistPlaybackState();
        this.syncMusicLevels(false);
    }

    unlockMusicPlayback() {
        this.init();
        this.musicPaused = false;
        this.tryResumeFromLifecycle(true);
        this.persistPlaybackState();
        return this.getMusicPlayerSnapshot();
    }

    resumeMusicPlayback() {
        this.init();
        this.musicPaused = false;
        this.tryResumeFromLifecycle(!this.musicUnlocked);
        this.persistPlaybackState();
        return this.getMusicPlayerSnapshot();
    }

    pauseMusicPlayback() {
        this.init();
        this.musicPaused = true;
        this.persistPlaybackState();
        this.syncMusicLevels(false);
        return this.getMusicPlayerSnapshot();
    }

    toggleMusicPlayback() {
        this.init();
        if (!this.musicUnlocked || this.musicPaused) {
            return this.resumeMusicPlayback();
        }
        return this.pauseMusicPlayback();
    }

    playTrack(track: MusicTrack) {
        this.init();
        this.manualTrackOverride = track;
        this.musicPaused = false;
        if (this.musicScene === "silent") {
            this.musicScene = MUSIC_TRACK_LIBRARY[track].scene;
        }
        this.tryResumeFromLifecycle(!this.musicUnlocked);
        this.persistPlaybackState();
        return this.getMusicPlayerSnapshot();
    }

    skipNextTrack() {
        const current = this.getCurrentTrackId() || MUSIC_TRACK_ORDER[0];
        const index = MUSIC_TRACK_ORDER.indexOf(current);
        const nextTrack = MUSIC_TRACK_ORDER[(index + 1) % MUSIC_TRACK_ORDER.length];
        return this.playTrack(nextTrack);
    }

    skipPreviousTrack() {
        const current = this.getCurrentTrackId() || MUSIC_TRACK_ORDER[0];
        const index = MUSIC_TRACK_ORDER.indexOf(current);
        const previousTrack = MUSIC_TRACK_ORDER[(index - 1 + MUSIC_TRACK_ORDER.length) % MUSIC_TRACK_ORDER.length];
        return this.playTrack(previousTrack);
    }

    setMasterEnabled(enabled: boolean) {
        this.init();
        this.settings.masterEnabled = enabled;
        this.persistSettings();
        this.syncMusicLevels(true);
        return this.getSettingsSnapshot();
    }

    setMusicEnabled(enabled: boolean) {
        this.init();
        this.settings.musicEnabled = enabled;
        this.persistSettings();
        this.syncMusicLevels(true);
        return this.getSettingsSnapshot();
    }

    setSfxEnabled(enabled: boolean) {
        this.init();
        this.settings.sfxEnabled = enabled;
        this.persistSettings();
        return this.getSettingsSnapshot();
    }

    setMasterVolume(volume: number) {
        this.init();
        this.settings.masterVolume = Math.max(0, Math.min(1, volume));
        this.persistSettings();
        this.syncMusicLevels(true);
        return this.getSettingsSnapshot();
    }

    setMusicVolume(volume: number) {
        this.init();
        this.settings.musicVolume = Math.max(0, Math.min(1, volume));
        this.persistSettings();
        this.syncMusicLevels(true);
        return this.getSettingsSnapshot();
    }

    setSfxVolume(volume: number) {
        this.init();
        this.settings.sfxVolume = Math.max(0, Math.min(1, volume));
        this.persistSettings();
        return this.getSettingsSnapshot();
    }

    toggle() {
        const next = this.setSfxEnabled(!this.settings.sfxEnabled);
        return next.sfxEnabled && next.masterEnabled;
    }

    setVolume(volume: number) {
        this.setSfxVolume(volume);
    }

    playTone(freq: number, duration: number, type: OscillatorType = "sine", relativeVolume = 1, detune = 0) {
        if (typeof window === "undefined") return;
        this.init();

        if (!this.ctx) return;
        const finalVolume = relativeVolume * this.getSfxMixLevel();
        if (finalVolume <= 0.0001) return;

        const oscillator = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, this.ctx.currentTime);
        oscillator.detune.setValueAtTime(detune, this.ctx.currentTime);

        gainNode.gain.setValueAtTime(finalVolume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        oscillator.start(this.ctx.currentTime);
        oscillator.stop(this.ctx.currentTime + duration);
    }

    getSuitProfile(suit?: string): SuitProfile {
        return SUIT_AUDIO[(suit || "").toUpperCase()] || SUIT_AUDIO.COMMAND;
    }

    getRankFrequency(card?: CardAudio) {
        const profile = this.getSuitProfile(card?.suit);
        const normalizedRank = Math.max(1, Math.min(9, Number(card?.rank) || 1));
        const semitone = RANK_INTERVALS[normalizedRank - 1] + profile.accent;
        return profile.root * Math.pow(2, semitone / 12);
    }

    cardPlay(card?: CardAudio, stackSize = 1) {
        if (!this.enabled) return;

        const profile = this.getSuitProfile(card?.suit);
        const baseFreq = this.getRankFrequency(card);
        const clampedStack = Math.max(1, Math.min(stackSize, 4));
        const duration = 0.12 + clampedStack * 0.03;
        const baseGain = Math.min(0.62 + clampedStack * 0.1, 0.88);

        this.playTone(baseFreq, duration, profile.wave, baseGain);
        window.setTimeout(() => {
            this.playTone(baseFreq * 1.5, duration * 0.8, "sine", baseGain * 0.55);
        }, 45);

        if (clampedStack >= 2) {
            window.setTimeout(() => {
                this.playTone(baseFreq * 1.25, duration * 0.9, "triangle", baseGain * 0.65);
            }, 80);
        }

        if (clampedStack >= 3) {
            window.setTimeout(() => {
                this.playTone(baseFreq * 2, duration, "square", baseGain * 0.45, profile.accent * 4);
            }, 120);
        }

        if ((card?.suit || "").toUpperCase() === "ANOMALY") {
            window.setTimeout(() => {
                this.playTone(baseFreq * 0.94, duration * 0.7, "sawtooth", baseGain * 0.3, -12);
            }, 100);
        }
    }

    cardSelect() {
        if (!this.enabled) return;
        this.playTone(220, 0.05, "triangle", 0.55);
    }

    scanResolve(success = true, roomPower = 0) {
        if (!this.enabled) return;

        const powerFactor = Math.max(0, Math.min(8, Number(roomPower) || 0));
        const root = 260 + powerFactor * 12;
        if (success) {
            this.playTone(root, 0.08, "triangle", 0.55);
            window.setTimeout(() => this.playTone(root * 1.26, 0.09, "sine", 0.5), 70);
            window.setTimeout(() => this.playTone(root * 1.62, 0.12, "triangle", 0.44), 150);
        } else {
            this.playTone(root * 0.92, 0.08, "sawtooth", 0.42);
            window.setTimeout(() => this.playTone(root * 0.76, 0.1, "square", 0.36), 80);
            window.setTimeout(() => this.playTone(root * 0.62, 0.14, "sawtooth", 0.28), 170);
        }
    }

    hallwayStep(stepIndex = 0, totalSteps = 1) {
        if (!this.enabled) return;

        const isLeftFoot = stepIndex % 2 === 0;
        const cadenceBoost = Math.min(Math.max(totalSteps, 1), 8) * 0.02;
        const baseGain = Math.min(0.44 + cadenceBoost, 0.62);
        const lowFreq = isLeftFoot ? 90 : 106;
        const clickFreq = isLeftFoot ? 430 : 520;
        const countFreq = Math.max(540, 900 - Math.min(stepIndex, 9) * 34 + (isLeftFoot ? 0 : 18));

        this.playTone(lowFreq, 0.12, "triangle", baseGain);
        this.playTone(lowFreq * 1.78, 0.06, "sine", baseGain * 0.24, isLeftFoot ? -14 : 14);
        window.setTimeout(() => {
            this.playTone(countFreq, 0.025, "square", baseGain * 0.38);
        }, 8);
        window.setTimeout(() => {
            this.playTone(clickFreq, 0.046, "square", baseGain * 0.62, isLeftFoot ? -8 : 6);
        }, 20);
        window.setTimeout(() => {
            this.playTone(clickFreq * 1.2, 0.03, "triangle", baseGain * 0.28, isLeftFoot ? 12 : -10);
        }, 44);
    }

    hallwayTraverse(stepCount = 1) {
        if (!this.enabled) return;

        const clampedSteps = Math.max(1, Math.min(16, Math.floor(stepCount)));
        for (let i = 0; i < clampedSteps; i += 1) {
            window.setTimeout(() => {
                this.hallwayStep(i, clampedSteps);
            }, i * 120);
        }
    }

    actionSuccess() {
        if (!this.enabled) return;

        this.playTone(523.25, 0.1, "sine", 0.72);
        window.setTimeout(() => this.playTone(659.25, 0.1, "sine", 0.72), 80);
        window.setTimeout(() => this.playTone(783.99, 0.15, "sine", 0.72), 160);
    }

    objectiveComplete() {
        if (!this.enabled) return;

        this.playTone(392, 0.08, "triangle", 0.68);
        window.setTimeout(() => this.playTone(523.25, 0.1, "sine", 0.7), 70);
        window.setTimeout(() => this.playTone(659.25, 0.12, "triangle", 0.72), 150);
        window.setTimeout(() => this.playTone(783.99, 0.18, "sawtooth", 0.42), 245);
    }

    actionFail() {
        if (!this.enabled) return;

        this.playTone(165, 0.1, "sawtooth", 0.5);
        window.setTimeout(() => this.playTone(146, 0.15, "sawtooth", 0.3), 80);
    }
}

export const soundManager = new MothershipSoundManager();
