import { expect, test } from 'bun:test'
import fs from 'fs/promises'

import { Citronella } from '../src'

import originalCode from './original.luau' with { type: 'text' }
import expectedCode from './expected.luau' with { type: 'text' }
import expectedBreakpoints from './expected-breakpoints.json'

test('Generates code properly', async () => {
  console.log('Original:\n' + originalCode)
  const transformed = await Citronella.inject({
    sourcePath: 'test.lua',
    code: originalCode,
    libPath: "'@lib/citronella'",
    hookVariable: '_trace',
  })
  console.log('Transformed code:\n' + transformed.code)
  console.log(
    'Transformed breakpoints:\n' + JSON.stringify(transformed.breakpoints),
  )
  if (process.env.WRITE_EXPECTED) {
    await fs.writeFile('test/expected.luau', transformed.code)
    await fs.writeFile(
      'test/expected-breakpoints.json',
      JSON.stringify(transformed.breakpoints),
    )
  } else {
    expect(transformed.code).toEqual(expectedCode)
    expect(transformed.breakpoints).toEqual(expectedBreakpoints)
  }
})

test(
  'Generates code quickly',
  async () => {
    const start = Bun.nanoseconds() / 1000 / 1000
    const sums = new Map<string, number>()
    const iterations = 10
    for (let i = 0; i < iterations; i++) {
      const { profileLabels } = await Citronella.inject({
        sourcePath: '',
        code: originalCode,
        libPath: '',
      })
      for (const [label, duration] of profileLabels) {
        sums.set(label, (sums.get(label) ?? 0) + duration)
      }
    }
    const end = Bun.nanoseconds() / 1000 / 1000
    const duration = end - start

    const averages = new Map<string, number>()
    for (const [label, sum] of sums) {
      averages.set(label, sum / iterations / 1000 / 1000)
    }

    console.log(
      `Code generation took ${duration / iterations} milliseconds on average`,
      averages,
    )
    expect(duration).toBeLessThan(1000)
  },
  { timeout: 100000 },
)
