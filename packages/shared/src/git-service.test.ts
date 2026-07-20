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
    await git.commit('Create doc1', { name: 'Test', email: 'test@citadelmd.local' })
    const log = await git.log('doc1.md')
    expect(log.total).toBe(1)
    expect(log.latest!.message).toContain('Create doc1')
  })

  it('commit returns GitCommitResult when changes exist', async () => {
    await fs.writeFile(path.join(tmp, 'doc2.md'), '# Test Doc 2')
    const result = await git.commit('Create doc2', { name: 'Test', email: 'test@citadelmd.local' })
    expect(result).toBeTruthy()
    expect(result!.sha).toBeTruthy()
    expect(result!.message).toBe('Create doc2')
  })

  it('commit returns null when no changes to commit', async () => {
    const result = await git.commit('No changes', { name: 'Test', email: 'test@citadelmd.local' })
    expect(result).toBeNull()
  })

  it('getRevisions returns revision history for a file', async () => {
    await fs.writeFile(path.join(tmp, 'doc3.md'), '# Doc 3 v1')
    await git.commit('Create doc3 v1', { name: 'Test', email: 'test@citadelmd.local' })
    
    await fs.writeFile(path.join(tmp, 'doc3.md'), '# Doc 3 v2')
    await git.commit('Update doc3 to v2', { name: 'Test', email: 'test@citadelmd.local' })
    
    const revisions = await git.getRevisions('doc3.md')
    expect(revisions.length).toBe(2)
    expect(revisions[0].message).toContain('Update doc3 to v2')
    expect(revisions[1].message).toContain('Create doc3 v1')
  })

  it('getRevisions respects limit parameter', async () => {
    const revisions = await git.getRevisions('doc3.md', 1)
    expect(revisions.length).toBe(1)
    expect(revisions[0].message).toContain('Update doc3 to v2')
  })

  it('hasUncommittedChanges returns false when no changes', async () => {
    const hasChanges = await git.hasUncommittedChanges('doc1.md')
    expect(hasChanges).toBe(false)
  })

  it('hasUncommittedChanges returns true when file has uncommitted changes', async () => {
    await fs.appendFile(path.join(tmp, 'doc1.md'), '\nUncommitted change')
    const hasChanges = await git.hasUncommittedChanges('doc1.md')
    expect(hasChanges).toBe(true)
  })

  it('move renames a file in git', async () => {
    await fs.writeFile(path.join(tmp, 'old-name.md'), '# Old name')
    await git.commit('Create file with old name', { name: 'Test', email: 'test@citadelmd.local' })
    
    await git.move('old-name.md', 'new-name.md')
    await git.commit('Rename file', { name: 'Test', email: 'test@citadelmd.local' })
    
    const exists = await fs.access(path.join(tmp, 'new-name.md')).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('discard reverts uncommitted changes to HEAD', async () => {
    await fs.appendFile(path.join(tmp, 'doc1.md'), '\nUncommitted line')
    await git.discard('doc1.md')
    const content = await fs.readFile(path.join(tmp, 'doc1.md'), 'utf-8')
    expect(content).not.toContain('Uncommitted line')
  })

  it('restore brings back an old version and commits it', async () => {
    const log = await git.log('doc1.md')
    const firstSha = log.latest!.sha
    await fs.appendFile(path.join(tmp, 'doc1.md'), '\\nVersion 2')
    await git.commit('Add v2', { name: 'Test', email: 'test@citadelmd.local' })
    
    const restoreResult = await git.restore('doc1.md', firstSha, { name: 'Test', email: 'test@citadelmd.local' })
    expect(restoreResult.sha).toBeTruthy()
    expect(restoreResult.message).toContain('restore')
    
    const content = await fs.readFile(path.join(tmp, 'doc1.md'), 'utf-8')
    expect(content).toContain('Hello')
    expect(content).not.toContain('Version 2')
  })

  it('show returns content of file at specific commit', async () => {
    const log = await git.log('doc1.md')
    const sha = log.latest!.sha
    const content = await git.show('doc1.md', sha)
    expect(content).toContain('Hello')
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
