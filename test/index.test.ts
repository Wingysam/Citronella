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
