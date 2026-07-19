import { describe, it, expect, afterAll } from 'vitest'
import { ensureGitRepo } from './git-init.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'citadelmd-gitinit-'))
const repoPath = path.join(tmpRoot, 'docs')

describe('ensureGitRepo', () => {
  it('initializes a new repo with initial commit', async () => {
    await ensureGitRepo(repoPath)
    const gitDir = path.join(repoPath, '.git')
    const stat = await fs.stat(gitDir)
    expect(stat.isDirectory()).toBe(true)

    const readme = await fs.readFile(path.join(repoPath, 'README.md'), 'utf-8')
    expect(readme).toContain('citadelMD Documents')
  })

  it('is idempotent — second call is a no-op', async () => {
    await expect(ensureGitRepo(repoPath)).resolves.not.toThrow()
  })
})

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})
