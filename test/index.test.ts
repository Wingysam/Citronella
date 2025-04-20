import { describe, expect, test } from 'bun:test'
import fs from 'fs/promises'

import { Citronella } from '../src'

for (const sample of await fs.readdir('test/samples')) {
  const originalCode = await fs.readFile(
    `test/samples/${sample}/original.luau`,
    'utf-8',
  )
  const expectedCode = await fs.readFile(
    `test/samples/${sample}/expected.luau`,
    'utf-8',
  )
  const expectedBreakpoints = JSON.parse(
    await fs.readFile(
      `test/samples/${sample}/expected-breakpoints.json`,
      'utf-8',
    ),
  )

  describe(`Sample: ${sample}`, () => {
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
        await fs.writeFile(
          `test/samples/${sample}/expected.luau`,
          transformed.code,
        )
        await fs.writeFile(
          `test/samples/${sample}/expected-breakpoints.json`,
          JSON.stringify(transformed.breakpoints),
        )
      } else {
        expect(transformed.code).toEqual(expectedCode)
        expect(transformed.breakpoints).toEqual(expectedBreakpoints)
      }
    })
  })
}
