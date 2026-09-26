import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A string, not `new URL`: under jsdom that's jsdom's URL, which fileURLToPath rejects.
const SRC = dirname(fileURLToPath(import.meta.url))

/** Core runs in the browser and in React Native: nothing either one lacks. */
const FORBIDDEN: [string, RegExp][] = [
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['window', /\bwindow\./],
  ['document', /\bdocument\./],
  ['navigator', /\bnavigator\./],
  ['import.meta', /import\.meta\.(env|glob)/],
  ['react', /from ['"]react(-dom)?['"]/],
]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sources(path)
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'testing.ts' ? [path] : []
  })
}

/** Comments may talk about localStorage; only code counts. */
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('core source', () => {
  it('uses no browser, bundler or React globals', () => {
    const violations = sources(SRC).flatMap((file) => {
      const code = stripComments(readFileSync(file, 'utf8'))
      return FORBIDDEN.filter(([, pattern]) => pattern.test(code)).map(([name]) => `${relative(SRC, file)}: ${name}`)
    })
    expect(violations).toEqual([])
  })
})
