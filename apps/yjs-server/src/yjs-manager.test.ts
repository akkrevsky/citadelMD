import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as Y from 'yjs'
import { YjsManager } from './yjs-manager.js'

let repo: string
let manager: YjsManager

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'yjs-test-'))
  manager = new YjsManager(repo)
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

const DOC = 'doc-test-1'
const FILE = 'note.md'
const CONTENT = '# Hello\n\nSome body text with Юникод.\n'

function cleanupSession() {
  // Simulate the 30s grace cleanup after the last client disconnects.
  ;(manager as unknown as { documents: Map<string, unknown> }).documents.delete(DOC)
}

describe('YjsManager sidecar persistence', () => {
  it('seeds a new document from the file when no sidecar exists', () => {
    writeFileSync(join(repo, FILE), CONTENT, 'utf8')
    const session = manager.initDocument(DOC, FILE)
    expect(session.ydoc.getText('markdown').toString()).toBe(CONTENT)
  })

  it('re-creating a session from the sidecar does not double content on re-sync', () => {
    writeFileSync(join(repo, FILE), CONTENT, 'utf8')
    const first = manager.initDocument(DOC, FILE)
    manager.flushDocument(DOC)
    // A still-connected client holds this exact state when the server
    // session is cleaned up (e.g. WS drop longer than the 30s grace).
    const clientState = Y.encodeStateAsUpdate(first.ydoc)
    cleanupSession()

    // Session re-created: the old implementation re-seeded the Y.Text from
    // the file with brand-new client IDs; the client's old items then merged
    // as CONCURRENT insertions at position 0 and the document doubled.
    const second = manager.initDocument(DOC, FILE)

    // Full bidirectional merge, as the sync handshake does.
    const clientDoc = new Y.Doc()
    Y.applyUpdate(clientDoc, clientState)
    Y.applyUpdate(clientDoc, Y.encodeStateAsUpdate(second.ydoc))
    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(clientDoc))

    expect(second.ydoc.getText('markdown').toString()).toBe(CONTENT)
    expect(clientDoc.getText('markdown').toString()).toBe(CONTENT)
  })

  it('restores an externally changed file via reload and rewrites the sidecar', () => {
    writeFileSync(join(repo, FILE), CONTENT, 'utf8')
    const session = manager.initDocument(DOC, FILE)
    manager.flushDocument(DOC)
    expect(existsSync(join(repo, FILE + '.ydoc'))).toBe(true)

    const newContent = 'checked-out revision\n'
    writeFileSync(join(repo, FILE), newContent, 'utf8')
    manager.reloadDocument(DOC)

    expect(session.ydoc.getText('markdown').toString()).toBe(newContent)

    // Sidecar rewritten: a session re-created now must converge to the new
    // content without resurrecting the old one.
    cleanupSession()
    const second = manager.initDocument(DOC, FILE)
    expect(second.ydoc.getText('markdown').toString()).toBe(newContent)
  })

  it('bumps the generation on reload and persists it in the sidecar', () => {
    writeFileSync(join(repo, FILE), CONTENT, 'utf8')
    const session = manager.initDocument(DOC, FILE)
    expect(session.ydoc.getMap('meta').get('generation')).toBe(0)
    manager.flushDocument(DOC)

    writeFileSync(join(repo, FILE), 'reverted\n', 'utf8')
    manager.reloadDocument(DOC)
    expect(session.ydoc.getMap('meta').get('generation')).toBe(1)

    // The bumped generation survives a session re-creation via the sidecar,
    // so a reconnecting client with pre-reset state detects the reset.
    cleanupSession()
    const second = manager.initDocument(DOC, FILE)
    expect(second.ydoc.getMap('meta').get('generation')).toBe(1)
  })

  it('falls back to the file when the sidecar is corrupt', () => {
    writeFileSync(join(repo, FILE), CONTENT, 'utf8')
    writeFileSync(join(repo, FILE + '.ydoc'), Buffer.from('not a yjs update'))
    const session = manager.initDocument(DOC, FILE)
    expect(session.ydoc.getText('markdown').toString()).toBe(CONTENT)
  })
})
