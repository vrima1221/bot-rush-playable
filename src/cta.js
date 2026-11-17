// Store redirect. Single place to change the destination.
export const STORE_URL = 'https://example.com/store';

let clicks = 0;

export function openStore() {
  clicks++;
  try {
    const m = window.mraid;
    if (m && typeof m.open === 'function') {
      m.open(STORE_URL);
      return 'mraid';
    }
  } catch (e) {
    /* fall through to window.open */
  }
  window.open(STORE_URL, '_blank');
  return 'window';
}

export function storeClicks() {
  return clicks;
}
