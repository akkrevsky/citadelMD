# Phase 2 — Documents CRUD + Git storage + Versions Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Documents stored in Git with full versioning capabilities, manual commit/discard/restore operations, and Redis-based file locking.

**Architecture:** Documents metadata stored in Postgres (table `documents`), actual content in Git working tree at `/data/docs/`. Manual Git operations (commit/discard/restore) with Redis distributed locking. Enhanced GitService with comprehensive Git operations.

**Tech Stack:** Prisma (migrations), simple-git (Git operations), ioredis (distributed locks), Fastify (API endpoints), React (frontend UI)

**Context for implementer:** Load docs/03-architecture.md (§2,3,4,11), docs/04-database-schema.md (documents), docs/05-api-contracts.md (§5,6,11) before starting.

---

## Task 1: Create documents table migration

**Objective:** Add the documents table to the database schema

**Files:**
- Create: `apps/backend/prisma/migrations/YYYYMMDDHHMMSS_add_documents/migration.sql`
- Modify: `apps/backend/prisma/schema.prisma` 

**Step 1: Add Document model to Prisma schema**

Add after the `FolderPermission` model:

```prisma
// =============== Документы ===============

model Document {
  id          String   @id @default(uuid()) @db.Uuid
  folderId    String   @map("folder_id") @db.Uuid
  folder      Folder   @relation(fields: [folderId], references: [id], onDelete: Cascade)
  title       String
  filePath    String   @map("file_path")   // UNIQUE — путь в Git-репо
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdById String?  @map("created_by") @db.Uuid
  createdBy   User?    @relation(fields: [createdById], references: [id])

  shares      Share[]
  uploads     Upload[]

  @@unique([filePath])
  @@unique([folderId, title])
  @@index([folderId])
  @@index([updatedAt])
  @@map("documents")
}
```

**Step 2: Add documents relation to Folder model**

Add to the `Folder` model after `permissions FolderPermission[]`:

```prisma
documents   Document[]
```

**Step 3: Add documents relation to User model**

Add to the `User` model after `uploads Upload[]`:

```prisma
documents         Document[]
```

**Step 4: Generate migration**

Run: `cd apps/backend && npx prisma migrate dev --name add_documents`

**Step 5: Commit**

```bash
git add apps/backend/prisma/
git commit -m "feat: add documents table schema

- Add Document model with folder relations
- Include file path uniqueness constraints
- Add indexes for performance optimization"
```

---

## Task 2: Enhance GitService with comprehensive Git operations

**Objective:** Extend GitService to support commit, discard, restore, diff operations

**Files:**
- Modify: `packages/shared/src/git-service.ts`
- Create: `packages/shared/src/git-service.test.ts` (extend existing)

**Step 1: Write failing tests for new methods**

Add to `packages/shared/src/git-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitService } from './git-service';
import fs from 'fs/promises';
import path from 'path';
import { rimraf } from 'rimraf';

// ... existing test setup ...

describe('GitService - versioning operations', () => {
  let gitService: GitService;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'test-git-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    gitService = new GitService(testDir);
    
    // Initialize repo and add initial file
    await gitService.init();
    await fs.writeFile(path.join(testDir, 'test.md'), '# Initial content');
    await gitService.add('test.md');
    await gitService.commit('Initial commit', { name: 'Test', email: 'test@example.com' });
  });

  afterEach(async () => {
    await rimraf(testDir);
  });

  it('should commit changes with author info', async () => {
    await fs.writeFile(path.join(testDir, 'test.md'), '# Updated content');
    await gitService.add('test.md');
    
    const result = await gitService.commit('Update content', { 
      name: 'John Doe', 
      email: 'john@example.com' 
    });
    
    expect(result.sha).toBeDefined();
    expect(result.message).toBe('Update content');
    expect(result.author.name).toBe('John Doe');
  });

  it('should return null when committing with no changes', async () => {
    const result = await gitService.commit('No changes', { 
      name: 'Test', 
      email: 'test@example.com' 
    });
    
    expect(result).toBeNull();
  });

  it('should discard uncommitted changes', async () => {
    await fs.writeFile(path.join(testDir, 'test.md'), '# Uncommitted changes');
    
    await gitService.discard('test.md');
    
    const content = await fs.readFile(path.join(testDir, 'test.md'), 'utf8');
    expect(content).toBe('# Initial content');
  });

  it('should show diff of uncommitted changes', async () => {
    await fs.writeFile(path.join(testDir, 'test.md'), '# Updated content');
    
    const diff = await gitService.diffUncommitted('test.md');
    
    expect(diff).toContain('-# Initial content');
    expect(diff).toContain('+# Updated content');
  });

  it('should get revision history for a file', async () => {
    // Add another commit
    await fs.writeFile(path.join(testDir, 'test.md'), '# Second version');
    await gitService.add('test.md');
    await gitService.commit('Second commit', { name: 'Test', email: 'test@example.com' });
    
    const revisions = await gitService.getRevisions('test.md');
    
    expect(revisions).toHaveLength(2);
    expect(revisions[0].message).toBe('Second commit');
    expect(revisions[1].message).toBe('Initial commit');
  });

  it('should restore file to specific revision', async () => {
    const initialCommit = await gitService.getRevisions('test.md');
    const initialSha = initialCommit[0].sha;
    
    // Make changes and commit
    await fs.writeFile(path.join(testDir, 'test.md'), '# Second version');
    await gitService.add('test.md');
    await gitService.commit('Second commit', { name: 'Test', email: 'test@example.com' });
    
    // Restore to initial version
    const restoreResult = await gitService.restore('test.md', initialSha, { 
      name: 'Test', 
      email: 'test@example.com' 
    });
    
    expect(restoreResult.sha).toBeDefined();
    
    const content = await fs.readFile(path.join(testDir, 'test.md'), 'utf8');
    expect(content).toBe('# Initial content');
  });
});
```

**Step 2: Run tests to verify failure**

Run: `cd packages/shared && npm test`
Expected: Multiple FAIL — methods not implemented

**Step 3: Implement the new GitService methods**

Add to `packages/shared/src/git-service.ts`:

```typescript
export interface GitCommitResult {
  sha: string;
  message: string;
  author: { name: string; email: string };
  date: Date;
}

export interface GitRevision {
  sha: string;
  message: string;
  author: { name: string; email: string };
  date: Date;
}

export interface GitAuthor {
  name: string;
  email: string;
}

export class GitService {
  // ... existing methods ...

  /**
   * Commit changes with author information
   * Returns null if no changes to commit
   */
  async commit(message: string, author: GitAuthor): Promise<GitCommitResult | null> {
    try {
      // Check if there are any changes
      const status = await this.git.status();
      if (status.files.length === 0) {
        return null;
      }

      // Set author environment
      const env = {
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
      };

      const result = await this.git.env(env).commit(message);
      
      return {
        sha: result.commit,
        message: message,
        author: author,
        date: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to commit: ${error}`);
    }
  }

  /**
   * Discard uncommitted changes for a specific file
   */
  async discard(filePath: string): Promise<void> {
    try {
      await this.git.checkout(['HEAD', '--', filePath]);
    } catch (error) {
      throw new Error(`Failed to discard changes for ${filePath}: ${error}`);
    }
  }

  /**
   * Get diff of uncommitted changes for a file
   */
  async diffUncommitted(filePath: string): Promise<string> {
    try {
      const diff = await this.git.diff(['HEAD', '--', filePath]);
      return diff;
    } catch (error) {
      throw new Error(`Failed to get diff for ${filePath}: ${error}`);
    }
  }

  /**
   * Get diff between two commits for a file
   */
  async diff(filePath: string, fromSha: string, toSha: string): Promise<string> {
    try {
      const diff = await this.git.diff([`${fromSha}..${toSha}`, '--', filePath]);
      return diff;
    } catch (error) {
      throw new Error(`Failed to get diff between ${fromSha} and ${toSha}: ${error}`);
    }
  }

  /**
   * Get revision history for a file
   */
  async getRevisions(filePath: string, limit = 100): Promise<GitRevision[]> {
    try {
      const log = await this.git.log({
        file: filePath,
        maxCount: limit,
        format: {
          hash: '%H',
          date: '%ai',
          message: '%s',
          author_name: '%an',
          author_email: '%ae',
        },
      });

      return log.all.map(commit => ({
        sha: commit.hash,
        message: commit.message,
        author: {
          name: commit.author_name,
          email: commit.author_email,
        },
        date: new Date(commit.date),
      }));
    } catch (error) {
      throw new Error(`Failed to get revisions for ${filePath}: ${error}`);
    }
  }

  /**
   * Show file content at specific revision
   */
  async show(filePath: string, sha: string): Promise<string> {
    try {
      const content = await this.git.show([`${sha}:${filePath}`]);
      return content;
    } catch (error) {
      throw new Error(`Failed to show ${filePath} at ${sha}: ${error}`);
    }
  }

  /**
   * Restore file to specific revision and create new commit
   */
  async restore(filePath: string, sha: string, author: GitAuthor): Promise<GitCommitResult> {
    try {
      // Get content from specific revision
      const content = await this.show(filePath, sha);
      
      // Write to working directory
      const fullPath = path.join(this.repoPath, filePath);
      await fs.writeFile(fullPath, content, 'utf8');
      
      // Add and commit the restoration
      await this.add(filePath);
      const result = await this.commit(`Restore ${filePath} to ${sha.substring(0, 7)}`, author);
      
      if (!result) {
        throw new Error('No changes after restore operation');
      }
      
      return result;
    } catch (error) {
      throw new Error(`Failed to restore ${filePath} to ${sha}: ${error}`);
    }
  }

  /**
   * Check if file has uncommitted changes
   */
  async hasUncommittedChanges(filePath: string): Promise<boolean> {
    try {
      const status = await this.git.status([filePath]);
      return status.files.length > 0;
    } catch (error) {
      return false;
    }
  }
}
```

Add required imports at the top:

```typescript
import fs from 'fs/promises';
import path from 'path';
```

**Step 4: Run tests to verify pass**

Run: `cd packages/shared && npm test`
Expected: All tests PASS

**Step 5: Build shared package**

Run: `cd packages/shared && npm run build`

**Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat: extend GitService with versioning operations

- Add commit method with author info and null return for no changes
- Add discard method to revert uncommitted changes
- Add diff methods for uncommitted and between-commit comparisons  
- Add revision history and show content methods
- Add restore method to revert to specific revision
- Include comprehensive test coverage"
```

---

## Task 3: Implement Redis distributed file locking

**Objective:** Create Redis-based distributed locking for Git operations

**Files:**
- Create: `packages/shared/src/file-lock.ts`
- Create: `packages/shared/src/file-lock.test.ts`

**Step 1: Write failing tests for file lock**

Create `packages/shared/src/file-lock.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFileLock } from './file-lock';
import Redis from 'ioredis';

describe('FileLock', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 15, // Use different DB for tests
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it('should acquire and release lock successfully', async () => {
    const withFileLock = createFileLock(redis);
    let executed = false;

    const result = await withFileLock('test/file.md', async () => {
      executed = true;
      return 'success';
    });

    expect(executed).toBe(true);
    expect(result).toBe('success');
  });

  it('should prevent concurrent access to same file', async () => {
    const withFileLock = createFileLock(redis);
    let firstStarted = false;
    let secondStarted = false;
    let firstFinished = false;

    const promise1 = withFileLock('test/file.md', async () => {
      firstStarted = true;
      await new Promise(resolve => setTimeout(resolve, 100));
      firstFinished = true;
      return 'first';
    });

    const promise2 = withFileLock('test/file.md', async () => {
      secondStarted = true;
      expect(firstFinished).toBe(true); // Should wait for first to complete
      return 'second';
    });

    const results = await Promise.all([promise1, promise2]);
    
    expect(firstStarted).toBe(true);
    expect(secondStarted).toBe(true);
    expect(results).toEqual(['first', 'second']);
  });

  it('should throw timeout error when lock cannot be acquired', async () => {
    const withFileLock = createFileLock(redis, { timeout: 100 });

    // Hold lock indefinitely
    const promise1 = withFileLock('test/file.md', async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return 'first';
    });

    // This should timeout
    const promise2 = withFileLock('test/file.md', async () => {
      return 'second';
    });

    await expect(promise2).rejects.toThrow('timeout');
    
    // First should still complete
    const result1 = await promise1;
    expect(result1).toBe('first');
  });

  it('should release lock even if function throws', async () => {
    const withFileLock = createFileLock(redis);

    await expect(withFileLock('test/file.md', async () => {
      throw new Error('test error');
    })).rejects.toThrow('test error');

    // Lock should be released, next call should work
    const result = await withFileLock('test/file.md', async () => {
      return 'success';
    });

    expect(result).toBe('success');
  });
});
```

**Step 2: Run tests to verify failure**

Run: `cd packages/shared && npm test file-lock`
Expected: FAIL — file not found

**Step 3: Implement file lock utility**

Create `packages/shared/src/file-lock.ts`:

```typescript
import Redis from 'ioredis';

export interface FileLockOptions {
  timeout?: number; // milliseconds
  retryDelay?: number; // milliseconds
}

export type WithFileLock = <T>(
  filePath: string,
  fn: () => Promise<T>
) => Promise<T>;

/**
 * Create a Redis-based distributed file lock utility
 */
export function createFileLock(
  redis: Redis,
  options: FileLockOptions = {}
): WithFileLock {
  const { timeout = 30000, retryDelay = 100 } = options;

  return async function withFileLock<T>(
    filePath: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lockKey = `lock:file:${filePath}`;
    const lockValue = `${Date.now()}-${Math.random()}`;
    const startTime = Date.now();

    // Try to acquire lock
    while (Date.now() - startTime < timeout) {
      const acquired = await redis.set(
        lockKey,
        lockValue,
        'PX', // milliseconds
        10000, // 10 second expiration
        'NX' // only set if not exists
      );

      if (acquired === 'OK') {
        try {
          // Lock acquired, execute function
          const result = await fn();
          return result;
        } finally {
          // Release lock (only if we still own it)
          await redis.eval(
            `if redis.call("get", KEYS[1]) == ARGV[1] then
               return redis.call("del", KEYS[1])
             else
               return 0
             end`,
            1,
            lockKey,
            lockValue
          );
        }
      }

      // Lock not acquired, wait and retry
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    throw new Error(`Failed to acquire file lock for ${filePath}: timeout after ${timeout}ms`);
  };
}
```

**Step 4: Add to shared package index**

Modify `packages/shared/src/index.ts`:

```typescript
export * from './types';
export * from './git-service';
export * from './file-lock';
```

**Step 5: Run tests to verify pass**

Run: `cd packages/shared && npm test`
Expected: All tests PASS

**Step 6: Build shared package**

Run: `cd packages/shared && npm run build`

**Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat: add Redis-based distributed file locking

- Create file lock utility using Redis SET with NX and PX
- Support timeout and retry mechanisms
- Proper lock release with Lua script to prevent race conditions
- Comprehensive test coverage including timeout scenarios"
```

---

## Task 4: Create document service with Git integration

**Objective:** Implement document service with Git operations and Redis locking

**Files:**
- Create: `apps/backend/src/services/document.service.ts`
- Create: `apps/backend/src/services/document.service.test.ts`

**Step 1: Write failing tests for document service**

Create `apps/backend/src/services/document.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentService } from './document.service';
import { prisma } from '../prisma';
import { GitService } from '@citadelmd/shared';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { rimraf } from 'rimraf';

describe('DocumentService', () => {
  let documentService: DocumentService;
  let testGitDir: string;
  let redis: Redis;
  let testUser: any;
  let testFolder: any;

  beforeEach(async () => {
    // Setup test Git directory
    testGitDir = path.join(process.cwd(), 'test-git-' + Date.now());
    await fs.mkdir(testGitDir, { recursive: true });

    // Setup Redis
    redis = new Redis({ db: 15 });
    await redis.flushdb();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        login: 'testuser',
        passwordHash: 'hash',
        role: 'EDITOR',
        gitName: 'Test User',
        gitEmail: 'test@example.com',
      },
    });

    // Create test folder
    testFolder = await prisma.folder.create({
      data: {
        name: 'Test Folder',
        gitPath: 'test-folder',
        createdById: testUser.id,
      },
    });

    documentService = new DocumentService(testGitDir, redis);
  });

  afterEach(async () => {
    await prisma.document.deleteMany();
    await prisma.folder.deleteMany();
    await prisma.user.deleteMany();
    await redis.flushdb();
    redis.disconnect();
    await rimraf(testGitDir);
  });

  it('should create document with initial commit', async () => {
    const document = await documentService.createDocument({
      title: 'Test Document',
      folderId: testFolder.id,
      createdById: testUser.id,
    });

    expect(document.title).toBe('Test Document');
    expect(document.filePath).toBe('test-folder/test-document.md');
    expect(document.folderId).toBe(testFolder.id);

    // Check file exists in git
    const filePath = path.join(testGitDir, document.filePath);
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe('# Test Document\n\n');

    // Check git history
    const gitService = new GitService(testGitDir);
    const revisions = await gitService.getRevisions(document.filePath);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].message).toBe('Create Test Document');
  });

  it('should get document content from working tree', async () => {
    const document = await documentService.createDocument({
      title: 'Test Doc',
      folderId: testFolder.id,
      createdById: testUser.id,
    });

    // Modify file in working tree
    const filePath = path.join(testGitDir, document.filePath);
    await fs.writeFile(filePath, '# Modified content\n\nSome changes');

    const content = await documentService.getDocumentContent(document.id);
    expect(content).toBe('# Modified content\n\nSome changes');
  });

  it('should commit changes with lock', async () => {
    const document = await documentService.createDocument({
      title: 'Test Doc',
      folderId: testFolder.id,
      createdById: testUser.id,
    });

    // Modify file
    const filePath = path.join(testGitDir, document.filePath);
    await fs.writeFile(filePath, '# Modified content\n\nChanges made');

    const result = await documentService.commitChanges(
      document.id,
      'Update content',
      testUser.id
    );

    expect(result).toBeDefined();
    expect(result!.message).toBe('Update content [user:testuser]');
    expect(result!.author.name).toBe('Test User');
  });

  it('should return null when committing with no changes', async () => {
    const document = await documentService.createDocument({
      title: 'Test Doc',
      folderId: testFolder.id,
      createdById: testUser.id,
    });

    const result = await documentService.commitChanges(
      document.id,
      'No changes',
      testUser.id
    );

    expect(result).toBeNull();
  });

  it('should discard uncommitted changes', async () => {
    const document = await documentService.createDocument({
      title: 'Test Doc',
      folderId: testFolder.id,
      createdById: testUser.id,
    });

    // Modify file
    const filePath = path.join(testGitDir, document.filePath);
    await fs.writeFile(filePath, '# Modified content');

    await documentService.discardChanges(document.id);

    // Content should be reverted
    const content = await documentService.getDocumentContent(document.id);
    expect(content).toBe('# Test Doc\n\n');
  });

  it('should get document revisions', async () => {
    const document = await documentService.createDocument({
      title: 'Test Doc',
      folderId: testFolder.id,
      createdById: testUser.id,
    });

    // Make another commit
    const filePath = path.join(testGitDir, document.filePath);
    await fs.writeFile(filePath, '# Updated content');
    await documentService.commitChanges(document.id, 'Update', testUser.id);

    const revisions = await documentService.getDocumentRevisions(document.id);
    
    expect(revisions).toHaveLength(2);
    expect(revisions[0].message).toBe('Update [user:testuser]');
    expect(revisions[1].message).toBe('Create Test Doc');
  });
});
```

**Step 2: Run tests to verify failure**

Run: `cd apps/backend && npm test document.service`
Expected: FAIL — service not implemented

**Step 3: Implement document service**

Create `apps/backend/src/services/document.service.ts`:

```typescript
import { GitService, GitCommitResult, GitRevision, createFileLock, WithFileLock } from '@citadelmd/shared';
import { prisma } from '../prisma';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';

export interface CreateDocumentInput {
  title: string;
  folderId: string;
  createdById: string;
}

export interface DocumentWithMetadata {
  id: string;
  title: string;
  filePath: string;
  folderId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: {
    id: string;
    login: string;
    displayName?: string;
  };
  folder: {
    id: string;
    name: string;
    gitPath: string;
  };
  hasUncommittedChanges: boolean;
}

export class DocumentService {
  private gitService: GitService;
  private withFileLock: WithFileLock;

  constructor(
    private readonly gitRepoPath: string,
    redis: Redis
  ) {
    this.gitService = new GitService(gitRepoPath);
    this.withFileLock = createFileLock(redis);
  }

  /**
   * Create a new document with initial commit
   */
  async createDocument(input: CreateDocumentInput): Promise<DocumentWithMetadata> {
    const { title, folderId, createdById } = input;

    // Get folder and user info
    const [folder, user] = await Promise.all([
      prisma.folder.findUniqueOrThrow({
        where: { id: folderId },
        select: { id: true, name: true, gitPath: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: createdById },
        select: { 
          id: true, 
          login: true, 
          displayName: true, 
          gitName: true, 
          gitEmail: true 
        },
      }),
    ]);

    // Generate file path
    const fileName = this.sanitizeFileName(title) + '.md';
    const filePath = path.posix.join(folder.gitPath, fileName);

    // Create document in database
    const document = await prisma.document.create({
      data: {
        title,
        folderId,
        filePath,
        createdById,
      },
      include: {
        folder: { select: { id: true, name: true, gitPath: true } },
        createdBy: { select: { id: true, login: true, displayName: true } },
      },
    });

    // Create initial file content
    const initialContent = `# ${title}\n\n`;
    const fullFilePath = path.join(this.gitRepoPath, filePath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullFilePath), { recursive: true });
    
    // Write file and commit
    await fs.writeFile(fullFilePath, initialContent, 'utf8');
    await this.gitService.add(filePath);
    
    const author = {
      name: user.gitName || user.displayName || user.login,
      email: user.gitEmail || `${user.login}@mdcollab.local`,
    };
    
    await this.gitService.commit(`Create ${title}`, author);

    return {
      ...document,
      hasUncommittedChanges: false,
    };
  }

  /**
   * Get document metadata by ID
   */
  async getDocument(documentId: string): Promise<DocumentWithMetadata> {
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: {
        folder: { select: { id: true, name: true, gitPath: true } },
        createdBy: { select: { id: true, login: true, displayName: true } },
      },
    });

    const hasUncommittedChanges = await this.gitService.hasUncommittedChanges(document.filePath);

    return {
      ...document,
      hasUncommittedChanges,
    };
  }

  /**
   * Get document content from working tree
   */
  async getDocumentContent(documentId: string): Promise<string> {
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { filePath: true },
    });

    const fullFilePath = path.join(this.gitRepoPath, document.filePath);
    
    try {
      return await fs.readFile(fullFilePath, 'utf8');
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`Document file not found: ${document.filePath}`);
      }
      throw error;
    }
  }

  /**
   * Commit changes for a document
   */
  async commitChanges(
    documentId: string,
    message: string,
    userId: string
  ): Promise<GitCommitResult | null> {
    const [document, user] = await Promise.all([
      prisma.document.findUniqueOrThrow({
        where: { id: documentId },
        select: { filePath: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { login: true, gitName: true, gitEmail: true, displayName: true },
      }),
    ]);

    return this.withFileLock(document.filePath, async () => {
      // Add file to staging
      await this.gitService.add(document.filePath);

      const author = {
        name: user.gitName || user.displayName || user.login,
        email: user.gitEmail || `${user.login}@mdcollab.local`,
      };

      const commitMessage = `${message} [user:${user.login}]`;
      const result = await this.gitService.commit(commitMessage, author);

      if (result) {
        // Update document timestamp
        await prisma.document.update({
          where: { id: documentId },
          data: { updatedAt: new Date() },
        });
      }

      return result;
    });
  }

  /**
   * Discard uncommitted changes for a document
   */
  async discardChanges(documentId: string): Promise<void> {
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { filePath: true },
    });

    return this.withFileLock(document.filePath, async () => {
      await this.gitService.discard(document.filePath);
    });
  }

  /**
   * Get diff of uncommitted changes
   */
  async getUncommittedDiff(documentId: string): Promise<string> {
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { filePath: true },
    });

    return this.gitService.diffUncommitted(document.filePath);
  }

  /**
   * Get revision history for a document
   */
  async getDocumentRevisions(documentId: string, limit = 100): Promise<GitRevision[]> {
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { filePath: true },
    });

    return this.gitService.getRevisions(document.filePath, limit);
  }

  /**
   * Get content at specific revision
   */
  async getRevisionContent(documentId: string, sha: string): Promise<string> {
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { filePath: true },
    });

    return this.gitService.show(document.filePath, sha);
  }

  /**
   * Restore document to specific revision
   */
  async restoreToRevision(
    documentId: string,
    sha: string,
    userId: string
  ): Promise<GitCommitResult> {
    const [document, user] = await Promise.all([
      prisma.document.findUniqueOrThrow({
        where: { id: documentId },
        select: { filePath: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { login: true, gitName: true, gitEmail: true, displayName: true },
      }),
    ]);

    return this.withFileLock(document.filePath, async () => {
      const author = {
        name: user.gitName || user.displayName || user.login,
        email: user.gitEmail || `${user.login}@mdcollab.local`,
      };

      const result = await this.gitService.restore(document.filePath, sha, author);

      // Update document timestamp
      await prisma.document.update({
        where: { id: documentId },
        data: { updatedAt: new Date() },
      });

      return result;
    });
  }

  /**
   * Update document metadata (title/rename)
   */
  async updateDocument(
    documentId: string,
    updates: { title?: string },
    userId: string
  ): Promise<DocumentWithMetadata> {
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { folder: true },
    });

    if (updates.title && updates.title !== document.title) {
      const newFileName = this.sanitizeFileName(updates.title) + '.md';
      const newFilePath = path.posix.join(document.folder.gitPath, newFileName);

      // Rename file in git
      await this.withFileLock(document.filePath, async () => {
        await this.gitService.move(document.filePath, newFilePath);

        const user = await prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { login: true, gitName: true, gitEmail: true, displayName: true },
        });

        const author = {
          name: user.gitName || user.displayName || user.login,
          email: user.gitEmail || `${user.login}@mdcollab.local`,
        };

        await this.gitService.commit(
          `Rename "${document.title}" to "${updates.title}" [user:${user.login}]`,
          author
        );
      });

      // Update database
      await prisma.document.update({
        where: { id: documentId },
        data: {
          title: updates.title,
          filePath: newFilePath,
          updatedAt: new Date(),
        },
      });
    }

    return this.getDocument(documentId);
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId: string, userId: string): Promise<void> {
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { filePath: true, title: true },
    });

    await this.withFileLock(document.filePath, async () => {
      // Remove from git
      await this.gitService.remove(document.filePath);

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { login: true, gitName: true, gitEmail: true, displayName: true },
      });

      const author = {
        name: user.gitName || user.displayName || user.login,
        email: user.gitEmail || `${user.login}@mdcollab.local`,
      };

      await this.gitService.commit(
        `Delete "${document.title}" [user:${user.login}]`,
        author
      );
    });

    // Remove from database
    await prisma.document.delete({
      where: { id: documentId },
    });
  }

  /**
   * Sanitize filename for file system
   */
  private sanitizeFileName(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
```

**Step 4: Add missing GitService methods**

Add to `packages/shared/src/git-service.ts`:

```typescript
/**
 * Move/rename a file in git
 */
async move(oldPath: string, newPath: string): Promise<void> {
  try {
    await this.git.mv(oldPath, newPath);
  } catch (error) {
    throw new Error(`Failed to move ${oldPath} to ${newPath}: ${error}`);
  }
}

/**
 * Remove a file from git
 */
async remove(filePath: string): Promise<void> {
  try {
    await this.git.rm(filePath);
  } catch (error) {
    throw new Error(`Failed to remove ${filePath}: ${error}`);
  }
}
```

**Step 5: Run tests to verify pass**

Run: `cd packages/shared && npm run build && cd ../apps/backend && npm test document.service`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/shared/ apps/backend/
git commit -m "feat: implement document service with Git integration

- Create comprehensive DocumentService with Git operations
- Support document creation with initial commit
- Implement commit/discard/restore operations with Redis locking
- Add revision history and diff capabilities
- Include file rename and delete with Git operations
- Comprehensive test coverage for all operations"
```

---

## Task 5: Create document API routes

**Objective:** Implement REST API endpoints for document operations

**Files:**
- Create: `apps/backend/src/routes/documents.ts`
- Modify: `apps/backend/src/server.ts` (register routes)

**Step 1: Write failing test for document routes**

Create `apps/backend/src/routes/documents.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '../server';
import { prisma } from '../prisma';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { rimraf } from 'rimraf';

describe('Document Routes', () => {
  let app: any;
  let testGitDir: string;
  let redis: Redis;
  let testUser: any;
  let testFolder: any;
  let authCookie: string;

  beforeEach(async () => {
    // Setup test environment
    testGitDir = path.join(process.cwd(), 'test-git-' + Date.now());
    await fs.mkdir(testGitDir, { recursive: true });
    
    redis = new Redis({ db: 15 });
    await redis.flushdb();

    app = await build({
      logger: false,
      GIT_REPO_PATH: testGitDir,
      REDIS_URL: 'redis://localhost:6379/15',
    });

    // Create test user and folder
    testUser = await prisma.user.create({
      data: {
        login: 'testuser',
        passwordHash: '$2a$10$example.hash',
        role: 'EDITOR',
        gitName: 'Test User',
        gitEmail: 'test@example.com',
      },
    });

    testFolder = await prisma.folder.create({
      data: {
        name: 'Test Folder',
        gitPath: 'test-folder',
        createdById: testUser.id,
      },
    });

    // Login to get auth cookie
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        login: 'testuser',
        password: 'password123',
      },
    });

    authCookie = loginResponse.cookies[0].name + '=' + loginResponse.cookies[0].value;
  });

  afterEach(async () => {
    await app.close();
    await prisma.document.deleteMany();
    await prisma.folder.deleteMany();
    await prisma.user.deleteMany();
    await redis.flushdb();
    redis.disconnect();
    await rimraf(testGitDir);
  });

  it('should create document with POST /api/folders/:folderId/documents', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/folders/${testFolder.id}/documents`,
      headers: { cookie: authCookie },
      payload: {
        title: 'New Document',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.document.title).toBe('New Document');
    expect(body.document.filePath).toBe('test-folder/new-document.md');

    // Check file was created
    const filePath = path.join(testGitDir, body.document.filePath);
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe('# New Document\n\n');
  });

  it('should get document metadata with GET /api/documents/:id', async () => {
    // Create document first
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/folders/${testFolder.id}/documents`,
      headers: { cookie: authCookie },
      payload: { title: 'Test Doc' },
    });

    const documentId = JSON.parse(createResponse.body).document.id;

    const response = await app.inject({
      method: 'GET',
      url: `/api/documents/${documentId}`,
      headers: { cookie: authCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.document.title).toBe('Test Doc');
    expect(body.document.hasUncommittedChanges).toBe(false);
  });

  it('should export document content with GET /api/documents/:id/export', async () => {
    // Create document
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/folders/${testFolder.id}/documents`,
      headers: { cookie: authCookie },
      payload: { title: 'Test Doc' },
    });

    const documentId = JSON.parse(createResponse.body).document.id;

    const response = await app.inject({
      method: 'GET',
      url: `/api/documents/${documentId}/export`,
      headers: { cookie: authCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(response.body).toBe('# Test Doc\n\n');
  });

  it('should commit changes with POST /api/documents/:id/commit', async () => {
    // Create document
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/folders/${testFolder.id}/documents`,
      headers: { cookie: authCookie },
      payload: { title: 'Test Doc' },
    });

    const document = JSON.parse(createResponse.body).document;

    // Modify file
    const filePath = path.join(testGitDir, document.filePath);
    await fs.writeFile(filePath, '# Updated content\n\nNew changes');

    const response = await app.inject({
      method: 'POST',
      url: `/api/documents/${document.id}/commit`,
      headers: { cookie: authCookie },
      payload: {
        message: 'Update content',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sha).toBeDefined();
    expect(body.message).toBe('Update content [user:testuser]');
  });

  it('should return 200 with no changes message when committing without changes', async () => {
    // Create document
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/folders/${testFolder.id}/documents`,
      headers: { cookie: authCookie },
      payload: { title: 'Test Doc' },
    });

    const document = JSON.parse(createResponse.body).document;

    const response = await app.inject({
      method: 'POST',
      url: `/api/documents/${document.id}/commit`,
      headers: { cookie: authCookie },
      payload: {
        message: 'No changes',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('no changes');
  });
});
```

**Step 2: Run tests to verify failure**

Run: `cd apps/backend && npm test documents`
Expected: FAIL — routes not implemented

**Step 3: Implement document routes**

Create `apps/backend/src/routes/documents.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { DocumentService } from '../services/document.service';
import { authMiddleware, requireRole } from '../middleware/auth';
import Redis from 'ioredis';

interface DocumentParams {
  id: string;
}

interface FolderDocumentsParams {
  folderId: string;
}

interface CreateDocumentBody {
  title: string;
}

interface CommitDocumentBody {
  message: string;
}

interface UpdateDocumentBody {
  title?: string;
}

export async function documentRoutes(fastify: FastifyInstance) {
  // Initialize Redis and DocumentService
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const documentService = new DocumentService(
    process.env.GIT_REPO_PATH || '/data/docs',
    redis
  );

  // All routes require authentication
  fastify.addHook('preHandler', authMiddleware);

  // POST /api/folders/:folderId/documents
  fastify.post<{
    Params: FolderDocumentsParams;
    Body: CreateDocumentBody;
  }>('/folders/:folderId/documents', {
    preHandler: requireRole(['ADMIN', 'EDITOR']),
    schema: {
      params: {
        type: 'object',
        properties: {
          folderId: { type: 'string', format: 'uuid' },
        },
        required: ['folderId'],
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
        },
        required: ['title'],
      },
    },
  }, async (request, reply) => {
    const { folderId } = request.params;
    const { title } = request.body;
    const userId = request.user!.id;

    try {
      const document = await documentService.createDocument({
        title,
        folderId,
        createdById: userId,
      });

      reply.code(201).send({ document });
    } catch (error: any) {
      if (error.code === 'P2002') {
        reply.code(409).send({ error: 'Document with this title already exists in folder' });
      } else if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Folder not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to create document' });
      }
    }
  });

  // GET /api/documents/:id
  fastify.get<{
    Params: DocumentParams;
  }>('/documents/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const document = await documentService.getDocument(id);
      
      // TODO: Check folder permissions
      
      reply.send({ document });
    } catch (error: any) {
      if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to get document' });
      }
    }
  });

  // GET /api/documents/:id/export
  fastify.get<{
    Params: DocumentParams;
  }>('/documents/:id/export', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      // TODO: Check folder permissions
      
      const content = await documentService.getDocumentContent(id);
      
      reply
        .type('text/markdown; charset=utf-8')
        .send(content);
    } catch (error: any) {
      if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else if (error.message.includes('file not found')) {
        reply.code(404).send({ error: 'Document file not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to export document' });
      }
    }
  });

  // PATCH /api/documents/:id
  fastify.patch<{
    Params: DocumentParams;
    Body: UpdateDocumentBody;
  }>('/documents/:id', {
    preHandler: requireRole(['ADMIN', 'EDITOR']),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;
    const userId = request.user!.id;

    try {
      const document = await documentService.updateDocument(id, updates, userId);
      reply.send({ document });
    } catch (error: any) {
      if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else if (error.code === 'P2002') {
        reply.code(409).send({ error: 'Document with this title already exists in folder' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to update document' });
      }
    }
  });

  // DELETE /api/documents/:id
  fastify.delete<{
    Params: DocumentParams;
  }>('/documents/:id', {
    preHandler: requireRole(['ADMIN', 'EDITOR']),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user!.id;

    try {
      await documentService.deleteDocument(id, userId);
      reply.code(204).send();
    } catch (error: any) {
      if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to delete document' });
      }
    }
  });

  // POST /api/documents/:id/commit
  fastify.post<{
    Params: DocumentParams;
    Body: CommitDocumentBody;
  }>('/documents/:id/commit', {
    preHandler: requireRole(['ADMIN', 'EDITOR']),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 500 },
        },
        required: ['message'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { message } = request.body;
    const userId = request.user!.id;

    try {
      const result = await documentService.commitChanges(id, message, userId);
      
      if (result) {
        reply.send(result);
      } else {
        reply.send({ message: 'no changes' });
      }
    } catch (error: any) {
      if (error.message.includes('timeout')) {
        reply.code(409).send({ error: 'Another commit operation is in progress' });
      } else if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to commit changes' });
      }
    }
  });

  // POST /api/documents/:id/discard
  fastify.post<{
    Params: DocumentParams;
  }>('/documents/:id/discard', {
    preHandler: requireRole(['ADMIN', 'EDITOR']),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      await documentService.discardChanges(id);
      reply.send({ ok: true });
    } catch (error: any) {
      if (error.message.includes('timeout')) {
        reply.code(409).send({ error: 'Another operation is in progress' });
      } else if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to discard changes' });
      }
    }
  });

  // GET /api/documents/:id/diff
  fastify.get<{
    Params: DocumentParams;
  }>('/documents/:id/diff', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const diff = await documentService.getUncommittedDiff(id);
      const hasUncommittedChanges = diff.trim().length > 0;
      
      reply.send({
        hasUncommittedChanges,
        diff,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to get diff' });
      }
    }
  });

  // GET /api/documents/:id/revisions
  fastify.get<{
    Params: DocumentParams;
    Querystring: {
      limit?: number;
    };
  }>('/documents/:id/revisions', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { limit = 100 } = request.query;

    try {
      const revisions = await documentService.getDocumentRevisions(id, limit);
      reply.send({ revisions });
    } catch (error: any) {
      if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to get revisions' });
      }
    }
  });

  // GET /api/documents/:id/revisions/:sha
  fastify.get<{
    Params: DocumentParams & { sha: string };
  }>('/documents/:id/revisions/:sha', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          sha: { type: 'string', minLength: 7, maxLength: 40 },
        },
        required: ['id', 'sha'],
      },
    },
  }, async (request, reply) => {
    const { id, sha } = request.params;

    try {
      const content = await documentService.getRevisionContent(id, sha);
      
      reply
        .type('text/markdown; charset=utf-8')
        .send(content);
    } catch (error: any) {
      if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else if (error.message.includes('bad revision')) {
        reply.code(404).send({ error: 'Revision not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to get revision content' });
      }
    }
  });

  // POST /api/documents/:id/revisions/:sha/restore
  fastify.post<{
    Params: DocumentParams & { sha: string };
  }>('/documents/:id/revisions/:sha/restore', {
    preHandler: requireRole(['ADMIN', 'EDITOR']),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          sha: { type: 'string', minLength: 7, maxLength: 40 },
        },
        required: ['id', 'sha'],
      },
    },
  }, async (request, reply) => {
    const { id, sha } = request.params;
    const userId = request.user!.id;

    try {
      const result = await documentService.restoreToRevision(id, sha, userId);
      reply.send(result);
    } catch (error: any) {
      if (error.message.includes('timeout')) {
        reply.code(409).send({ error: 'Another operation is in progress' });
      } else if (error.code === 'P2025') {
        reply.code(404).send({ error: 'Document not found' });
      } else if (error.message.includes('bad revision')) {
        reply.code(404).send({ error: 'Revision not found' });
      } else {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to restore revision' });
      }
    }
  });
}
```

**Step 4: Register routes in server**

Modify `apps/backend/src/server.ts` to add document routes:

```typescript
// Add after existing route registrations
await fastify.register(require('./routes/documents').documentRoutes, { 
  prefix: '/api' 
});
```

**Step 5: Run tests to verify pass**

Run: `cd apps/backend && npm test documents`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add apps/backend/
git commit -m "feat: implement document API routes

- Add comprehensive REST API for document operations
- Support document CRUD operations with Git integration
- Implement commit/discard/restore version control endpoints
- Add revision history and diff endpoints
- Include proper error handling and validation schemas
- Full test coverage for all endpoints"
```

---

## Task 6: Create document migration and deploy

**Objective:** Deploy the documents table migration to production

**Files:**
- Run migration deployment

**Step 1: Apply migration in Docker**

Run: `cd /home/sp/workspace/citadelMD && docker compose -f infra/docker-compose.yml exec backend npx prisma migrate deploy`

**Step 2: Verify migration**

Run: `cd /home/sp/workspace/citadelMD && docker compose -f infra/docker-compose.yml exec backend npx prisma migrate status`

Expected: All migrations applied

**Step 3: Test API endpoints**

Test document creation:
```bash
# Login first to get cookie
curl -c cookies.txt -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}'

# Create a document  
curl -b cookies.txt -X POST http://localhost/api/folders/{folder-id}/documents \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Document"}'
```

**Step 4: Commit deployment verification**

```bash
git add . && git commit -m "deploy: apply documents table migration

- Documents table successfully created in production
- All Phase 2 API endpoints operational
- Git integration working with Redis locking"
```

---

**Plan Summary:**

Phase 2 implementation provides:
- ✅ Documents table with proper constraints and indexes
- ✅ Enhanced GitService with commit/discard/restore operations  
- ✅ Redis distributed file locking for concurrent operation safety
- ✅ Comprehensive DocumentService with Git integration
- ✅ Full REST API for document operations and versioning
- ✅ Migration deployment and production verification

**Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?**