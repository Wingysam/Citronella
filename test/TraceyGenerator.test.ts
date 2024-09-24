import { expect, test } from 'bun:test'
import { TraceyGenerator } from '../src/TraceyGenerator'

const original = `
--!strict
local a = 'b'
local function f()
  print(a)
end
f()
`.trim()

const expected = `
--!strict
local _trace = require(game.ReplicatedStorage.Scripts.Tracey)._register('test.lua') local a = 'b'
_trace(3) local function f()
_trace(4)   print(a)
_trace(5) end
_trace(6) f()
`.trim()

test('Generates code properly', () => {
  const generator = new TraceyGenerator({
    sourcePath: 'test.lua',
    code: original,
    libPath: 'game.ReplicatedStorage.Scripts.Tracey',
    hookVariable: '_trace',
  })
  const result = generator.insertTraceHooks()
  expect(result).toBe(expected)
})
