/**
 * The device picker above the frame.
 *
 * Browser chrome, deliberately kept out of `src/app.tsx`: a device has one
 * screen size and never asks the app about it, so anything that switches
 * between sizes is part of the preview rather than part of the app.
 *
 * What it buys is the check a browser window cannot give you — Lynx has no
 * `@media` and therefore no breakpoint to fall back on, so a layout either fits
 * the width the device hands it or it does not.
 */

type Device = { label: string; width: number; height: number }

const DEVICES: readonly Device[] = [
  { label: 'iPhone 15', width: 393, height: 852 },
  { label: 'iPhone SE', width: 375, height: 667 },
  { label: 'Pixel 8', width: 412, height: 915 },
  { label: 'iPad mini', width: 744, height: 1024 },
]

/** Remembered across reloads, so a dev loop does not restart on the wrong screen. */
const STORAGE_KEY = 'mini-lynx-preview-device'

export const installDeviceSwitcher = (): void => {
  const select = document.getElementById('device')
  if (!(select instanceof HTMLSelectElement)) return

  for (const [index, device] of DEVICES.entries()) {
    const option = document.createElement('option')
    option.value = String(index)
    option.textContent = `${device.label} · ${device.width}×${device.height}`
    select.append(option)
  }

  const apply = (index: number): void => {
    const device = DEVICES[index] ?? DEVICES[0]
    if (!device) return
    // The frame reads both as custom properties, so the CSS owns every pixel of
    // the bezel and this owns only the two numbers a device actually decides.
    document.documentElement.style.setProperty('--device-width', `${device.width}px`)
    document.documentElement.style.setProperty('--device-height', `${device.height}px`)
    select.value = String(index)
    // A private window, or storage the browser refuses, is not a reason to lose
    // the preview.
    try {
      localStorage.setItem(STORAGE_KEY, String(index))
    } catch {}
  }

  let remembered = 0
  try {
    remembered = Number(localStorage.getItem(STORAGE_KEY) ?? 0)
  } catch {}

  apply(Number.isInteger(remembered) ? remembered : 0)
  select.addEventListener('change', () => apply(Number(select.value)))
}
