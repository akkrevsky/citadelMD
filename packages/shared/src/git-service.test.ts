import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GitService } from './git-service.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'citadelmd-git-test-'))
const git = new GitService(tmp)

beforeAll(async () => {
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@citadelmd.local')
})

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('GitService', () => {
  it('creates a commit and it appears in log', async () => {
    await fs.writeFile(path.join(tmp, 'doc1.md'), '# Hello')
    await git.commit('doc1.md', 'Create doc1', { name: 'Test', email: 'test@citadelmd.local' })
    const log = await git.log('doc1.md')
    expect(log.total).toBe(1)
    expect(log.latest!.message).toContain('Create doc1')
  })

  it('discard reverts uncommitted changes to HEAD', async () => {
    await fs.appendFile(path.join(tmp, 'doc1.md'), '\nUncommitted line')
    await git.discard('doc1.md')
    const content = await fs.readFile(path.join(tmp, 'doc1.md'), 'utf-8')
    expect(content).not.toContain('Uncommitted line')
  })

  it('restore brings back an old version', async () => {
    const log = await git.log('doc1.md')
    const firstSha = log.latest!.sha
    await fs.appendFile(path.join(tmp, 'doc1.md'), '\nVersion 2')
    await git.commit('doc1.md', 'Add v2', { name: 'Test', email: 'test@citadelmd.local' })
    await git.restore('doc1.md', firstSha)
    await git.commit('doc1.md', 'Restore to v1', { name: 'Test', email: 'test@citadelmd.local' })
    const content = await fs.readFile(path.join(tmp, 'doc1.md'), 'utf-8')
    expect(content).toContain('Hello')
    expect(content).not.toContain('Version 2')
  })

  it('diffUncommitted returns empty when no changes', async () => {
    const diff = await git.diffUncommitted('doc1.md')
    expect(diff).toBe('')
  })

  it('diffUncommitted shows added/removed lines', async () => {
    await fs.appendFile(path.join(tmp, 'doc1.md'), '\nNew uncommitted')
    const diff = await git.diffUncommitted('doc1.md')
    expect(diff).toContain('+New uncommitted')
  })
})
