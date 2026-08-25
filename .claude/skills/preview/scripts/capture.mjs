import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const preinstalled = '/opt/pw-browsers/chromium'

const options = {
  url: 'http://localhost:5173/',
  out: 'preview.png',
  width: 390,
  height: 844,
  taps: [],
}

const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const flag = args[i]
  const value = args[i + 1]
  if (flag === '--url') options.url = value
  else if (flag === '--out') options.out = value
  else if (flag === '--width') options.width = Number(value)
  else if (flag === '--height') options.height = Number(value)
  else if (flag === '--tap') options.taps.push(value)
  else continue
  i++
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE ?? (existsSync(preinstalled) ? preinstalled : undefined),
  args: ['--no-sandbox'],
})
const page = await browser.newPage({
  viewport: { width: options.width, height: options.height },
  deviceScaleFactor: 2,
})

const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(String(error)))

await page.goto(options.url, { waitUntil: 'networkidle' })
for (const text of options.taps) {
  await page.getByText(text, { exact: true }).first().click()
  await page.waitForTimeout(400)
}
await page.waitForTimeout(300)
await page.screenshot({ path: options.out })
await browser.close()

if (errors.length > 0) {
  console.error('page errors:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('saved ' + options.out)
