import type { ArchitectureRuleId } from './fixture-manifest'

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import ts from 'typescript'

import {
  forbiddenImportRules,
  numericLiteralAllowlist,
  structuralNumericLiterals,
  writeCapabilityOwnerRules,
} from './owner-map'

interface SourceImportRecord {
  importedNames: string[]
  isTypeOnly: boolean
  source: string
}

interface SourceNumberRecord {
  text: string
  value: number
}

/**
 * Describes one architecture violation found in a scanned source file.
 *
 * Use when:
 * - The boundary suite needs stable assertion output
 * - A fixture or production file triggers an architecture rule
 *
 * Expects:
 * - `filePath` uses package-relative slash-separated paths
 *
 * Returns:
 * - A single architecture violation with rule id and message
 */
export interface ArchitectureViolation {
  filePath: string
  message: string
  ruleId: ArchitectureRuleId
}

function toPackagePath(packageRoot: string, filePath: string) {
  return relative(packageRoot, filePath).replaceAll('\\', '/')
}

function matchesModuleSegment(source: string, moduleSegment: string) {
  return source === moduleSegment || source.endsWith(`/${moduleSegment}`)
}

function collectImports(sourceFile: ts.SourceFile) {
  const imports: SourceImportRecord[] = []

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const importedNames: string[] = []
      const importClause = node.importClause

      if (importClause?.name && !importClause.isTypeOnly) {
        importedNames.push(importClause.name.text)
      }

      if (importClause?.namedBindings && !importClause.isTypeOnly) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          importedNames.push(importClause.namedBindings.name.text)
        }

        if (ts.isNamedImports(importClause.namedBindings)) {
          for (const element of importClause.namedBindings.elements) {
            if (!element.isTypeOnly) {
              importedNames.push(element.name.text)
            }
          }
        }
      }

      imports.push({
        source: node.moduleSpecifier.text,
        importedNames,
        isTypeOnly: importClause?.isTypeOnly ?? false,
      })
    }

    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({
        source: node.arguments[0].text,
        importedNames: [],
        isTypeOnly: false,
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return imports
}

function collectNumbers(sourceFile: ts.SourceFile) {
  const numbers: SourceNumberRecord[] = []

  function visit(node: ts.Node): void {
    if (ts.isNumericLiteral(node)) {
      numbers.push({
        text: node.text,
        value: Number(node.text),
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return numbers
}

function checkOwnerBoundary(filePath: string, imports: SourceImportRecord[]) {
  const violations: ArchitectureViolation[] = []

  for (const importRecord of imports) {
    if (importRecord.isTypeOnly) {
      continue
    }

    for (const rule of writeCapabilityOwnerRules) {
      if (!matchesModuleSegment(importRecord.source, rule.moduleSegment)) {
        continue
      }

      const touchesWriteCapability = importRecord.importedNames.some(name => rule.importNames.includes(name))

      if (!touchesWriteCapability) {
        continue
      }

      if (rule.allowedImporters.includes(filePath)) {
        continue
      }

      violations.push({
        filePath,
        ruleId: 'owner-boundary',
        message: `Only designated cognition owners may import ${rule.importNames.join(', ')} from ${rule.moduleSegment}.`,
      })
    }
  }

  return violations
}

function checkForbiddenImports(filePath: string, imports: SourceImportRecord[]) {
  const violations: ArchitectureViolation[] = []

  for (const importRecord of imports) {
    for (const rule of forbiddenImportRules) {
      if (!rule.pattern.test(importRecord.source)) {
        continue
      }

      violations.push({
        filePath,
        ruleId: rule.ruleId,
        message: rule.message,
      })
    }
  }

  return violations
}

function checkNumericThresholds(filePath: string, numbers: SourceNumberRecord[]) {
  const allowlistEntry = numericLiteralAllowlist.find(entry => entry.filePath === filePath)
  const allowedValues = new Set([...(allowlistEntry?.allowedValues ?? []), ...structuralNumericLiterals])

  return numbers
    .filter(numberRecord => !allowedValues.has(numberRecord.value))
    .map<ArchitectureViolation>(numberRecord => ({
      filePath,
      ruleId: 'forbidden-threshold',
      message: `Unexpected numeric literal ${numberRecord.text} found outside the documented Phase A constant allowlist.`,
    }))
}

function shouldScanProductionFile(filePath: string) {
  return !filePath.endsWith('.test.ts')
    && !filePath.includes('/test-utils/')
    && !filePath.includes('/architecture/fixtures/')
}

async function walkSourceFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...await walkSourceFiles(entryPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(entryPath)
    }
  }

  return files
}

/**
 * Scans one TypeScript file for Phase A cognition architecture violations.
 *
 * Use when:
 * - A test fixture should trigger one specific architecture failure
 * - A production source file needs a local boundary check
 *
 * Expects:
 * - `packageRoot` points at `packages/cognition-core`
 *
 * Returns:
 * - All violations discovered in the target file
 */
export async function inspectArchitectureFile(packageRoot: string, filePath: string): Promise<ArchitectureViolation[]> {
  const sourceText = await readFile(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const packagePath = toPackagePath(packageRoot, filePath)
  const imports = collectImports(sourceFile)
  const numbers = collectNumbers(sourceFile)

  return [
    ...checkOwnerBoundary(packagePath, imports),
    ...checkForbiddenImports(packagePath, imports),
    ...checkNumericThresholds(packagePath, numbers),
  ]
}

/**
 * Collects the production source files that belong to the cognition-core package.
 *
 * Use when:
 * - The architecture suite needs to scan the shipped Phase A source surface
 * - Validation should skip fixtures, tests, and test helpers
 *
 * Expects:
 * - `packageRoot` points at `packages/cognition-core`
 *
 * Returns:
 * - Absolute file paths for production TypeScript files under `src`
 */
export async function collectProductionSourceFiles(packageRoot: string): Promise<string[]> {
  const sourceRoot = join(packageRoot, 'src')
  const sourceFiles = await walkSourceFiles(sourceRoot)

  return sourceFiles.filter(filePath => shouldScanProductionFile(toPackagePath(packageRoot, filePath)))
}

/**
 * Scans the production cognition-core source surface for architecture violations.
 *
 * Use when:
 * - The architecture suite validates the live Phase A implementation
 * - A future refactor needs one focused boundary check across the package
 *
 * Expects:
 * - `packageRoot` points at `packages/cognition-core`
 *
 * Returns:
 * - All violations discovered across the production source files
 */
export async function inspectProductionSourceFiles(packageRoot: string): Promise<ArchitectureViolation[]> {
  const sourceFiles = await collectProductionSourceFiles(packageRoot)
  const violations = await Promise.all(sourceFiles.map(filePath => inspectArchitectureFile(packageRoot, filePath)))

  return violations.flat()
}
