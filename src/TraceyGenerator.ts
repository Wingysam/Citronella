import { customAlphabet } from 'nanoid'

const generateId = customAlphabet('abcdefghijklmnopqrstuv', 16)

type TraceyGeneratorOptions = {
  sourcePath: string
  code: string
  libPath: string
  hookVariable?: string
}

export class TraceyGenerator {
  private options: TraceyGeneratorOptions
  private debugLibVar: string

  constructor(options: TraceyGeneratorOptions) {
    this.options = options
    this.debugLibVar = options.hookVariable ?? generateId()
  }

  insertTraceHooks() {
    let foundNonComment = false
    return this.options.code
      .split('\n')
      .map((lineOfCode, lineNumber) => {
        if (!foundNonComment) {
          if (lineOfCode.trimStart().startsWith('--')) return lineOfCode
          foundNonComment = true
          return `${this.generateTraceImport()} ${lineOfCode}`
        }
        // Skip multi-line statements like f(
        //   "arg"
        // )
        if (!/^\s*[a-z]/i.test(lineOfCode)) return lineOfCode
        return `${this.generateTraceHook(lineNumber + 1)} ${lineOfCode}`
      })
      .join('\n')
  }

  private generateTraceImport() {
    return `local ${this.debugLibVar} = require(${this.options.libPath})._register('${this.options.sourcePath}')`
  }

  private generateTraceHook(lineNumber: number) {
    return `${this.debugLibVar}(${lineNumber})`
  }
}
