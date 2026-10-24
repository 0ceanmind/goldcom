// Goldcom Studio audio module: SFX library, procedural music beds and the reel soundtrack mixer.
export { SFX_LIBRARY, SFX_VERSION, ensureSfx, renderSfx, sfxInfo } from './synth.mjs';
export { MUSIC_LIBRARY, MUSIC_VERSION, ensureMusic, renderMusic, renderMusicFile, beatGrid, musicTiming } from './music.mjs';
export { mixAudio, muxAudio, measureFile, loadAudio, DEFAULT_SFX_DIR, DEFAULT_MUSIC_DIR } from './mix.mjs';
