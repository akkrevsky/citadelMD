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

  async commit(message: string, author: GitAuthor): Promise<GitCommitResult | null> {
    // Check if there are any changes to commit
    const status = await this.git.status()
    if (status.files.length === 0) {
      return null
    }

    // Add all changes
    await this.git.add(['-A'])
    const result = await this.git.commit(message, {
      '--author': `${author.name} <${author.email}>`,
    })
    
    return {
      sha: result.commit,
      message: message
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

  async mkdir(dirPath: string): Promise<void> {
    await this.git.raw(['commit', '--allow-empty', '-m', `mkdir: ${dirPath}`])
  }

  async remove(filePath: string): Promise<void> {
    await this.git.rm([filePath, '-r'])
  }
}
