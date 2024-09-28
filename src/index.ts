import { customAlphabet } from 'nanoid'
import JSON5 from 'json5'

const generateId = customAlphabet('abcdefghijklmnopqrstuv', 16)

type AstDocument = {
  root: AstStatBlock
}

type AstNode =
  | AstStatBlock
  | AstStatLocal
  | AstStatLocalFunction
  | AstStatExpr
  | AstExpr

type AstBase = {
  type: string
  location: Location
  variablesInScope: string[]
}

type AstStatBlock = AstBase & {
  type: 'AstStatBlock'
  hasEnd: boolean
  body: AstNode[]
}

type AstStatLocal = AstBase & {
  type: 'AstStatLocal'
  vars: AstLocal[]
  values: AstExpr[]
}

type AstLocal = AstBase & {
  type: 'AstLocal'
  luauType: any
  name: string
}

type AstExpr =
  | AstExprTable
  | AstExprFunction
  | AstExprCall
  | AstExprGlobal
  | AstExprConstantString

type AstExprTable = AstBase & {
  type: 'AstExprTable'
  items: any[]
}

type AstStatLocalFunction = AstBase & {
  type: 'AstStatLocalFunction'
  name: AstLocal
  func: AstExprFunction
}

type AstExprFunction = AstBase & {
  type: 'AstExprFunction'
  generics: any[]
  genericPacks: any[]
  args: any[]
  vararg: boolean
  varargLocation: string
  body: AstStatBlock
  functionDepth: number
  debugname: string
}

type AstStatExpr = AstBase & {
  type: 'AstStatExpr'
  expr: AstExprCall
}

type AstExprCall = AstBase & {
  type: 'AstExprCall'
  func: AstExprGlobal
  args: AstExpr[]
}

type AstExprGlobal = AstBase & {
  type: 'AstExprGlobal'
  global: string
}

type AstExprConstantString = AstBase & {
  type: 'AstExprConstantString'
  value: string
}

type CitronellaOptions = {
  sourcePath: string
  code: string
  libPath: string
  hookVariable?: string
}

export class Citronella {
  private code: Uint8Array
  private lineOffsets: number[]
  private breakpoints: Location[] = []
  private writes: { offset: number; data: Uint8Array }[] = []
  private encoder = new TextEncoder()
  private decoder = new TextDecoder()
  private options: CitronellaOptions
  private debugLibVar: string
  private astNodes!: AstNode[]

  private constructor(options: CitronellaOptions) {
    this.options = options
    this.code = this.encoder.encode(options.code)
    this.lineOffsets = getLineOffsets(this.code)
    this.debugLibVar = options.hookVariable ?? generateId()
  }

  static async inject(options: CitronellaOptions) {
    const generator = new Citronella(options)
    await generator.getAstAndInsertHooks()
    generator.injectTraceImport()
    generator.applyWrites()
    return {
      code: generator.decoder.decode(generator.code),
      breakpoints: generator.breakpoints,
    }
  }

  private async getAstAndInsertHooks() {
    const ast = await this.getAst()
    this.insertTraceHooks(ast.root)
  }

  private async getAst(): Promise<AstDocument> {
    const proc = Bun.spawn(['luau-ast', '-'], {
      stdin: 'pipe',
    })
    const response = new Response(proc.stdout)
    proc.stdin.write(this.code)
    proc.stdin.flush()
    proc.stdin.end()
    const output = await response.text()
    const result = JSON5.parse(output)
    return result
  }

  private insertTraceHooks(astStatBlock: AstStatBlock) {
    this.astNodes = this.walkAst(astStatBlock).nodes
    for (const node of this.astNodes) {
      let varsString = ''
      if (typeof node === 'object' && node !== null) {
        varsString = this.variableNamesToTable(node.variablesInScope)
      }
      if (node.type === 'AstStatExpr') {
        this.hookExpression(
          node.location,
          `${node.location.start.line + 1},${node.location.start.column + 1},${varsString}`,
        )
      } else if (node.type === 'AstStatLocal') {
        for (const value of node.values) {
          this.hookExpression(
            value.location,
            `${value.location.start.line + 1},${value.location.start.column + 1},${varsString}`,
          )
        }
      } else if (node.type === 'AstExprCall') {
        for (const arg of node.args) {
          this.hookExpression(
            arg.location,
            `${arg.location.start.line + 1},${arg.location.start.column + 1},${varsString}`,
          )
        }
      }
    }
  }

  // Flattens the AST into an array of every object in the tree that has a "type" key.
  private walkAst(
    node: any,
    variablesInScope: string[] = [],
  ): { nodes: AstNode[]; newVariablesInScope: string[] } {
    let nodes: any[] = []

    const newVariablesInScope: string[] = []

    if (Array.isArray(node)) {
      for (const value of node) {
        const valueAst = this.walkAst(value, variablesInScope)
        variablesInScope = variablesInScope.concat(valueAst.newVariablesInScope)
        nodes = nodes.concat(valueAst.nodes)
      }
    } else if (typeof node === 'object' && node !== null) {
      node.variablesInScope = variablesInScope.slice() // Clone the array (faster than [...spread])

      for (const [key, value] of Object.entries(node)) {
        if (key === 'type') {
          nodes.push(node)
          if (value === 'AstStatLocal') {
            newVariablesInScope.push(
              ...(node as AstStatLocal).vars.map((v) => v.name),
            )
          } else if (value === 'AstStatLocalFunction') {
            const name = (node as AstStatLocalFunction).name.name
            variablesInScope.push(name)
          }
        } else if (typeof value === 'object') {
          const valueAst = this.walkAst(value, variablesInScope)
          variablesInScope = variablesInScope.concat(
            valueAst.newVariablesInScope,
          )
          nodes = nodes.concat(valueAst.nodes)
        }
      }

      if ('location' in node) {
        node.location = parseLocation(node.location)
      }
    }

    return { nodes, newVariablesInScope }
  }

  private hookExpression(location: Location, params: string) {
    this.breakpoints.push(location)
    this.spliceCode(location.end.line, location.end.column, ')')
    this.spliceCode(
      location.start.line,
      location.start.column,
      `${this.debugLibVar}(${params})(`,
    )
  }

  private spliceCode(line: number, column: number, add: string) {
    const offset = this.lineOffsets[line] + column
    const data = this.encoder.encode(add)
    this.writes.push({ offset, data })
  }

  private applyWrites() {
    this.writes.sort((a, b) => a.offset - b.offset)
    const arrays = []
    let lastOffset = 0
    const writtenTo = new Set<number>()
    for (const write of this.writes) {
      if (writtenTo.has(write.offset)) {
        throw new Error(`Duplicate writes at index ${write.offset}`)
      }
      arrays.push(this.code.slice(lastOffset, write.offset))
      arrays.push(write.data)
      lastOffset = write.offset
      writtenTo.add(write.offset)
    }
    arrays.push(this.code.slice(lastOffset))
    this.code = combineUint8Arrays(arrays)
  }

  private variableNamesToTable(variables: string[]) {
    return `{${variables.map((v) => `${v}=${v}`).join(',')}}`
  }

  private injectTraceImport() {
    const traceImport = this.generateTraceImport()
    const dashCharCode = '-'.charCodeAt(0)
    const bangCharCode = '!'.charCodeAt(0)
    for (const lineOffset of this.lineOffsets) {
      if (
        this.code[lineOffset] === dashCharCode &&
        this.code[lineOffset + 1] === dashCharCode &&
        this.code[lineOffset + 2] === bangCharCode
      ) {
        continue
      }
      this.writes.push({
        offset: lineOffset,
        data: this.encoder.encode(traceImport),
      })
      return
    }
  }

  private generateTraceImport() {
    return `local ${this.debugLibVar}=require(${this.options.libPath})._register('${this.options.sourcePath}');`
  }
}

const newlineCharCode = '\n'.charCodeAt(0)
function getLineOffsets(buffer: Uint8Array) {
  const lineOffsets = [0]
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === newlineCharCode) {
      lineOffsets.push(i + 1)
    }
  }
  return lineOffsets
}

function combineUint8Arrays(arrays: Uint8Array[]) {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const array of arrays) {
    result.set(array, offset)
    offset += array.length
  }
  return result
}

type Location = ReturnType<typeof parseLocation>
function parseLocation(location: string) {
  const [startCoordinates, endCoordinates] = location.split('-')
  return {
    start: getLineAndColumn(startCoordinates),
    end: getLineAndColumn(endCoordinates),
  }
}

function getLineAndColumn(coordinates: string) {
  const [line, column] = coordinates.split(',').map(Number)
  return { line, column }
}
