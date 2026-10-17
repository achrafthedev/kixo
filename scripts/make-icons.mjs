// Renders build/icon.svg to the PNG/ICO assets electron-builder needs.
import { Resvg } from '@resvg/resvg-js'
import { copyFileSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import pngToIco from 'png-to-ico'

const svg = readFileSync('build/icon.svg', 'utf8')
const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

writeFileSync('build/icon.png', render(512))
const files = [16, 24, 32, 48, 64, 128, 256].map((s) => {
  const f = `build/icon-${s}.png`
  writeFileSync(f, render(s))
  return f
})
writeFileSync('build/icon.ico', await pngToIco(files))
for (const f of files) unlinkSync(f)
copyFileSync('build/icon.png', 'resources/icon.png')
console.log('icons written')
