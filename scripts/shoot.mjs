/**
 * Screenshot the HUD from the dev server with a real microphone.
 *
 * The plain `chrome --screenshot` path cannot do this: --virtual-time-budget
 * fast-forwards timers, which trips the AbortSignal.timeout on the service
 * health check before the real response arrives, so the app always renders in
 * its mic-off state.
 *
 * Usage: node scripts/shoot.mjs <out.png> [waitMs]
 */
import puppeteer from 'puppeteer-core'

const CHROME =
  'C:/Users/vince/.cache/puppeteer/chrome/win64-148.0.7778.97/chrome-win64/chrome.exe'
const URL = 'http://127.0.0.1:1420/'

const out = process.argv[2] ?? 'hud.png'
const wait = Number(process.argv[3] ?? 5000)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu',
  ],
})

const page = await browser.newPage()
await page.setViewport({ width: 380, height: 500 })

const logs = []
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
page.on('response', (r) => {
  if (r.status() >= 400) logs.push(`http ${r.status()}: ${r.url()}`)
})
page.on('requestfailed', (r) => logs.push(`failed: ${r.url()} ${r.failure()?.errorText}`))

await page.goto(URL, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, wait))

// Report the state the screenshot cannot show.
const state = await page.evaluate(() => {
  const text = document.body.innerText
  const svg = document.body.innerHTML
  return {
    micOff: /MIC OFF/i.test(text),
    ribbons: (svg.match(/stroke-linecap="round"/g) || []).length,
    armedRing: svg.includes('stroke-dasharray="1.5 9"'),
    caption: text.replace(/\s+/g, ' ').trim().slice(0, 140),
  }
})

await page.screenshot({ path: out })
await browser.close()

console.log('mic open      :', !state.micOff)
console.log('armed ring    :', state.armedRing)
console.log('wave ribbons  :', state.ribbons)
console.log('on screen     :', state.caption)
const noise = logs.filter((l) => !/DevTools|Download the React/i.test(l))
if (noise.length) console.log('console       :\n  ' + noise.join('\n  '))
