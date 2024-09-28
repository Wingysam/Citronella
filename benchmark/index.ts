import { Citronella } from '../src'

import originalCode from './code.luau' with { type: 'text' }

let totalNs = 0
let totalRuns = 0
setInterval(() => {
  const totalMs = totalNs / 1000 / 1000
  const averageMs = totalMs / totalRuns
  console.log(`${totalRuns} runs, average time: ${Math.ceil(averageMs)} ms`)
}, 1000)
while (true) {
  const start = Bun.nanoseconds()
  await Citronella.inject({
    sourcePath: 'test.lua',
    code: originalCode,
    libPath: "'@lib/citronella'",
    hookVariable: '_trace',
  })
  const end = Bun.nanoseconds()
  const ns = end - start
  totalNs += ns
  totalRuns++
}
