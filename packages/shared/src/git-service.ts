import { simpleGit, type SimpleGit } from 'simple-git'

export interface GitAuthor {
  name: string
  email: string
}

export interface GitLogEntry {
  sha: string
  message: string
  authorName: string
  authorEmail: string
  date: string
}

export interface GitLogResult {
  total: number
  latest: GitLogEntry | null
  all: GitLogEntry[]
}

export interface GitCommitResult {
  sha: string
  message: string
}

export interface GitRevision {
  sha: string
  message: string
  authorName: string
  authorEmail: string
  date: string
}

/** SHA-1 of the empty tree object, the canonical "no parent" diff base. */
const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export class GitService {
  private git: SimpleGit

  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath)
  }

  async init(): Promise<void> {
    await this.git.init()
  }

  async addConfig(key: string, value: string): Promise<void> {
    await this.git.addConfig(key, value)
  }

  async commit(message: string, author: GitAuthor, filePaths?: string[]): Promise<GitCommitResult | null> {
    if (filePaths !== undefined) {
      // Stage ONLY the given paths so unrelated auto-saved files are not swept
      // into this commit. An empty array means "commit what is already staged"
      // (used after git mv / git rm, which stage their own changes).
      if (filePaths.length > 0) {
        await this.git.add(filePaths)
      }
    }
    // Regardless of how we got here, do a full -A if no filePaths were
    // specified, or rely on what git.add already staged above.
    if (filePaths === undefined) {
      const status = await this.git.status()
      if (status.files.length === 0) {
        return null
      }
      await this.git.add(['-A'])
    }

    const result = await this.git.commit(message, {
      '--author': `${author.name} <${author.email}>`,
    })

    // simple-git does not throw on "nothing to commit" — it returns an
    // empty commit hash, so treat that as "no changes" for both branches.
    if (!result.commit) {
      return null
    }

    return {
      sha: result.commit,
      message
    }
  }

  async discard(filePath: string): Promise<void> {
    await this.git.checkout(['HEAD', '--', filePath])
  }

  async restore(filePath: string, sha: string, author: GitAuthor): Promise<GitCommitResult> {
    await this.git.checkout([sha, '--', filePath])
    await this.git.add(filePath)
    const message = `restore ${filePath} to ${sha.substring(0, 8)}`
    const result = await this.git.commit(message, {
      '--author': `${author.name} <${author.email}>`,
    })
    
    return {
      sha: result.commit,
      message: message
    }
  }

  async log(filePath: string): Promise<GitLogResult> {
    const result = await this.git.log({ file: filePath })
    return {
      total: result.total,
      latest: result.latest
        ? {
            sha: result.latest.hash,
            message: result.latest.message,
            authorName: result.latest.author_name,
            authorEmail: result.latest.author_email,
            date: result.latest.date,
          }
        : null,
      all: result.all.map((e) => ({
        sha: e.hash,
        message: e.message,
        authorName: e.author_name,
        authorEmail: e.author_email,
        date: e.date,
      })),
    }
  }

  async diffUncommitted(filePath: string): Promise<string> {
    return this.git.diff(['HEAD', '--', filePath])
  }

  async diff(filePath: string, fromSha: string, toSha: string): Promise<string> {
    return this.git.diff([fromSha, toSha, '--', filePath])
  }

  /**
   * Diff from the empty tree to sha — renders a file's first commit as
   * pure additions. git's own --root flag compares against the repo's
   * root commit, which does not work for files first committed later.
   */
  async diffFromRoot(filePath: string, sha: string): Promise<string> {
    return this.git.diff([EMPTY_TREE_SHA, sha, '--', filePath])
  }

  async show(filePath: string, sha: string): Promise<string> {
    return this.git.show([`${sha}:${filePath}`])
  }

  async getRevisions(filePath: string, limit?: number): Promise<GitRevision[]> {
    const options: any = { file: filePath }
    if (limit) {
      options.maxCount = limit
    }
    
    const result = await this.git.log(options)
    return result.all.map((e) => ({
      sha: e.hash,
      message: e.message,
      authorName: e.author_name,
      authorEmail: e.author_email,
      date: e.date,
    }))
  }

  async hasUncommittedChanges(filePath: string): Promise<boolean> {
    const diff = await this.git.diff(['HEAD', '--', filePath])
    return diff.trim() !== ''
  }

  async move(oldPath: string, newPath: string): Promise<void> {
    await this.git.mv(oldPath, newPath)
  }

  /** Whether a path is tracked in git (committed or staged), regardless of its working-tree state */
  async isPathTracked(relativePath: string): Promise<boolean> {
    try {
      await this.git.raw(['ls-files', '--error-unmatch', '--', relativePath])
      return true
    } catch {
      return false
    }
  }

  /** All paths tracked in the index (git ls-files), one per line */
  async listTrackedFiles(): Promise<string[]> {
    const raw = await this.git.raw(['ls-files'])
    return raw.split('\n').filter((line) => line.length > 0)
  }

  /** Whether the working tree has any modified or untracked files */
  async hasAnyChanges(): Promise<boolean> {
    const status = await this.git.status()
    return status.files.length > 0
  }

  async remove(filePath: string): Promise<void> {
    await this.git.rm([filePath, '-r'])
  }

  /**
   * Full-text search across markdown files using git grep.
   * Returns matches with file path, line number, and matched content.
   * If a folder path is provided, search is scoped to that directory.
   */
  async grep(
    query: string,
    folderPath?: string,
  ): Promise<Array<{ filePath: string; line: number; match: string }>> {
    const searchPath = folderPath ?? '.'
    const escapedQuery = query.replace(/\\/g, '\\\\')
    try {
      // Search under folderPath if given, otherwise whole repo.
      // The repo stores only Markdown files, so no extension filter needed.
      const pathspec = folderPath ? `${folderPath}/` : '.'
      const raw = await this.git.raw([
        'grep',
        '-n',
        '-i',
        '-e',
        escapedQuery,
        '--',
        pathspec,
      ])
      if (!raw.trim()) return []
      return raw
        .trim()
        .split('\n')
        .map((line) => {
          const m = line.match(/^([^:]+):(\d+):(.*)/)
          if (!m) return null
          const [, filePath, lineNum, match] = m
          return { filePath, line: parseInt(lineNum, 10), match }
        })
        .filter(Boolean) as Array<{ filePath: string; line: number; match: string }>
    } catch (err: unknown) {
      // git grep exits with code 1 when there are no matches
      if ((err as { code?: number })?.code === 1) return []
      throw err
    }
  }
}
