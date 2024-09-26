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
  private code: string
  private breakpoints: Location[] = []
  private options: CitronellaOptions
  private debugLibVar: string
  private astNodes!: AstNode[]

  private constructor(options: CitronellaOptions) {
    this.options = options
    this.code = options.code
    this.debugLibVar = options.hookVariable ?? generateId()
  }

  static async inject(options: CitronellaOptions) {
    const generator = new Citronella(options)
    await generator.getAstAndInsertHooks()
    generator.injectTraceImport()
    return {
      code: generator.code,
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
    const encoder = new TextEncoder()
    proc.stdin.write(encoder.encode(this.code))
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
    const nodes: any[] = []

    const newVariablesInScope: string[] = []

    if (Array.isArray(node)) {
      for (const value of node) {
        const valueAst = this.walkAst(value, variablesInScope)
        variablesInScope = [
          ...variablesInScope,
          ...valueAst.newVariablesInScope,
        ]
        nodes.push(...valueAst.nodes)
      }
    } else if (typeof node === 'object' && node !== null) {
      node.variablesInScope = [...variablesInScope]

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
          variablesInScope = [
            ...variablesInScope,
            ...valueAst.newVariablesInScope,
          ]
          nodes.push(...valueAst.nodes)
        }
      }

      if (Object.hasOwn(node, 'location')) {
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
    const lines = this.code.split('\n')
    const lineIndex = line
    lines[lineIndex] = spliceStringBytes(lines[lineIndex], column, add)
    this.code = lines.join('\n')

    // Update the location of all nodes that are after the splice
    for (const node of this.astNodes) {
      if (!Object.hasOwn(node, 'location')) continue
      if (
        node.location.start.line === line &&
        node.location.start.column >= column
      ) {
        node.location.start.column += add.length
      }
      if (
        node.location.end.line === line &&
        node.location.end.column >= column
      ) {
        node.location.end.column += add.length
      }
    }
  }

  private variableNamesToTable(variables: string[]) {
    return `{${variables.map((v) => `${v}=${v}`).join(',')}}`
  }

  private injectTraceImport() {
    const traceImport = this.generateTraceImport()
    const lines = this.code.split('\n')
    const firstLineThatIsNotCompilerDirective = lines.findIndex(
      (line) => !line.startsWith('--!'),
    )
    lines[firstLineThatIsNotCompilerDirective] =
      `${traceImport}${lines[firstLineThatIsNotCompilerDirective]}`
    this.code = lines.join('\n')
  }

  private generateTraceImport() {
    return `local ${this.debugLibVar}=require(${this.options.libPath})._register('${this.options.sourcePath}');`
  }
}

function spliceStringBytes(str: string, index: number, add: string) {
  return spliceBuffer(Buffer.from(str), index, add).toString()
}

function spliceBuffer(buffer: Buffer, index: number, add: string) {
  const start = buffer.subarray(0, index)
  const end = buffer.subarray(index)
  return Buffer.concat([start, Buffer.from(add), end])
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
