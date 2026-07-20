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

  async commit(filePath: string, message: string, author: GitAuthor): Promise<string> {
    await this.git.add(filePath)
    const result = await this.git.commit(message, filePath, {
      '--author': `${author.name} <${author.email}>`,
    })
    return result.commit
  }

  async discard(filePath: string): Promise<void> {
    await this.git.checkout(['HEAD', '--', filePath])
  }

  async restore(filePath: string, sha: string): Promise<void> {
    await this.git.checkout([sha, '--', filePath])
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

  async show(sha: string, filePath: string): Promise<string> {
    return this.git.show([`${sha}:${filePath}`])
  }

  async mkdir(dirPath: string): Promise<void> {
    await this.git.raw(['commit', '--allow-empty', '-m', `mkdir: ${dirPath}`])
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.git.mv(oldPath, newPath)
  }

  async remove(filePath: string): Promise<void> {
    await this.git.rm([filePath, '-r'])
  }
}
