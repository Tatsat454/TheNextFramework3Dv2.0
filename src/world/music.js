/** Island playlist — Epidemic Sound tracks, loops in order. */

export const ISLAND_PLAYLIST = [
  { id: "ambient-movements", title: "Ambient Movements", artist: "Elm Lake", file: "/music/ambient-movements.mp3" },
  { id: "balderdash", title: "Balderdash", artist: "Martin Klem", file: "/music/balderdash.mp3" },
  { id: "solitude", title: "Solitude", artist: "DonVayei", file: "/music/solitude.mp3" },
  { id: "tiny-pockets", title: "Tiny Pockets", artist: "The Fly Guy Five", file: "/music/tiny-pockets.mp3" },
];

export function createMusicEngine() {
  const audio = new Audio();
  audio.preload = "auto";

  let started = false;
  let off = false;
  let paused = false;
  let index = 0;
  let onTrackChange = null;

  const track = () => ISLAND_PLAYLIST[index] || null;

  const emit = () => {
    onTrackChange?.(track(), {
      index,
      total: ISLAND_PLAYLIST.length,
      off,
      paused,
      playing: started && !off && !paused && !audio.paused,
    });
  };

  const load = (i) => {
    index = ((i % ISLAND_PLAYLIST.length) + ISLAND_PLAYLIST.length) % ISLAND_PLAYLIST.length;
    const next = track();
    audio.src = next.file;
    audio.currentTime = 0;
  };

  const play = async () => {
    if (off) return false;
    paused = false;
    try {
      if (!audio.src) load(index);
      await audio.play();
      started = true;
      emit();
      return true;
    } catch (error) {
      console.warn("Music play failed:", track()?.file, error);
      emit();
      return false;
    }
  };

  audio.addEventListener("ended", () => {
    if (off) return;
    load(index + 1);
    play();
  });

  audio.addEventListener("error", () => {
    if (off) return;
    // Skip ahead so a bad file doesn't stall the loop.
    load(index + 1);
    play();
  });

  return {
    get muted() {
      return off;
    },
    get paused() {
      return paused;
    },
    get playing() {
      return started && !off && !paused && !audio.paused;
    },
    get track() {
      return track();
    },
    get playlist() {
      return ISLAND_PLAYLIST;
    },
    onTrackChange(callback) {
      onTrackChange = callback;
    },
    async start() {
      off = false;
      paused = false;
      audio.volume = 0.55;
      if (!audio.src) load(0);
      return play();
    },
    async pause() {
      if (off || !started) return false;
      paused = true;
      audio.pause();
      emit();
      return true;
    },
    async resume() {
      if (off) return false;
      return play();
    },
    async togglePause() {
      if (off) return this.start();
      if (paused || audio.paused) return this.resume();
      return this.pause();
    },
    turnOff() {
      off = true;
      paused = false;
      audio.pause();
      audio.currentTime = 0;
      emit();
      return true;
    },
    async restart() {
      off = false;
      paused = false;
      audio.volume = 0.55;
      load(0);
      return play();
    },
    async next() {
      if (off) return false;
      load(index + 1);
      return play();
    },
    /** Back-compat for older menu wiring. */
    setMuted(nextOff) {
      if (nextOff) {
        this.turnOff();
        return true;
      }
      this.start();
      return false;
    },
    toggle() {
      if (off || (!this.playing && paused === false && !started)) {
        this.start();
        return false;
      }
      if (this.playing) {
        this.pause();
        return false;
      }
      if (paused) {
        this.resume();
        return false;
      }
      this.turnOff();
      return true;
    },
  };
}
