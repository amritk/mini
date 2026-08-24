import { mount, pageElement, setEngine } from '@amritk/mini-lynx'
import { createDomPapi } from '@amritk/mini-lynx-preview'

import { App } from '../app'
import '../styles.css'
import './frame.css'

import { installDeviceSwitcher } from './device-switcher'

/**
 * The browser entry, and the only file in this project that knows what a
 * browser is.
 *
 * A Lynx app talks to one thing: the Element PAPI, about thirty functions a
 * device injects as globals. `createDomPapi()` implements those over the DOM,
 * so the app above the boundary is the code that would ship to a device, byte
 * for byte — same tags, same attributes, same event dispatch.
 *
 * On a device this file does not exist; `src/device.ts` is `renderPage(App)`
 * and the engine calls it.
 *
 * The preview is emulating Lynx, not the other way round, so when the two
 * disagree the preview is what is wrong. `README.md` lists the four things it
 * is structurally blind to.
 */
const root = document.getElementById('app')
if (!root) throw new Error('#app is missing from index.html')

setEngine(createDomPapi({ root }))
mount(pageElement(), App)

// Browser chrome, not app code: the device frame's size picker.
installDeviceSwitcher()
