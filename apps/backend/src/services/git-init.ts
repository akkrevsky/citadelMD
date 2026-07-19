import { GitService } from '@citadelmd/shared'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function ensureGitRepo(repoPath: string): Promise<void> {
  const gitDir = path.join(repoPath, '.git')
  try {
    await fs.access(gitDir)
    console.log(`[git-init] Repo already exists at ${repoPath}`)
    return
  } catch {
    // .git does not exist — initialize
  }

  console.log(`[git-init] Initializing git repo at ${repoPath}`)
  await fs.mkdir(repoPath, { recursive: true })

  const git = new GitService(repoPath)
  await git.init()
  await git.addConfig('user.name', 'citadelMD System')
  await git.addConfig('user.email', 'system@citadelmd.local')

  await fs.writeFile(path.join(repoPath, 'README.md'), '# citadelMD Documents\n')
  await git.commit('README.md', 'Initial commit', {
    name: 'citadelMD System',
    email: 'system@citadelmd.local',
  })

  console.log('[git-init] Git repo initialized')
}
