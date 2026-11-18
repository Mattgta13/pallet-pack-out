/** Company logo for the spec sheet: uploaded once, kept in this browser, used on every sheet. */
import { useEffect, useState } from 'react';

const KEY = 'ppo.logo.v1';
/** Largest stored raster size; the sheet shows it about 46 px tall. */
const MAX_W = 720;
const MAX_H = 240;

function readUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('That file is not an image this browser can open.'));
    img.src = src;
  });
}

/** Read an image file into a compact data URL (SVG kept as is when small; rasters scaled down). */
export async function logoFromFile(file: File): Promise<string> {
  if (!/^image\//.test(file.type) && !/\.(svg|png|jpe?g|gif|webp)$/i.test(file.name)) throw new Error('Upload a PNG, JPG, SVG, GIF or WebP image.');
  const url = await readUrl(file);
  const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (svg && url.length < 400_000) {
    await loadImage(url); // make sure it opens
    return url;
  }
  const img = await loadImage(url);
  const s = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export function useLogo() {
  const [logo, setLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (logo) localStorage.setItem(KEY, logo);
      else localStorage.removeItem(KEY);
    } catch {
      setError('The logo could not be saved in this browser; it will show until the page is reloaded.');
    }
  }, [logo]);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setLogo(await logoFromFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return { logo, upload, remove: () => setLogo(null), error, clearError: () => setError(null) };
}
