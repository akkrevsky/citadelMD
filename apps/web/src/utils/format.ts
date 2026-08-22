/**
 * Format a creation timestamp as "MM.DD HH-MM" (e.g. "07.23 17-30").
 * Uses the user's local timezone. Returns '' for invalid input.
 */
export function formatCreatedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}.${dd} ${hh}-${min}`
}

export type FormatCommand = Record<string, unknown>

/**
 * Build the format-command payload that the toolbar dispatches to the
 * editor for a given action type. Unknown types yield an empty payload.
 */
export function buildFormatCommand(type: string): FormatCommand {
  const detail: FormatCommand = {}
  switch (type) {
    case 'undo':
    case 'redo':
    case 'find':
      detail.action = type
      break
    case 'bold':
      detail.action = 'wrap'; detail.wrapper = '**'; detail.placeholder = 'bold text'
      break
    case 'italic':
      detail.action = 'wrap'; detail.wrapper = '*'; detail.placeholder = 'italic text'
      break
    case 'strikethrough':
      detail.action = 'wrap'; detail.wrapper = '~~'; detail.placeholder = 'strikethrough'
      break
    case 'code':
      detail.action = 'wrap'; detail.wrapper = '`'; detail.placeholder = 'code'
      break
    case 'h1':
      detail.action = 'prefix'; detail.prefix = '# '; detail.placeholder = 'Heading 1'
      break
    case 'h2':
      detail.action = 'prefix'; detail.prefix = '## '; detail.placeholder = 'Heading 2'
      break
    case 'h3':
      detail.action = 'prefix'; detail.prefix = '### '; detail.placeholder = 'Heading 3'
      break
    case 'quote':
      detail.action = 'prefix'; detail.prefix = '> '; detail.placeholder = 'quote'
      break
    case 'ul':
      detail.action = 'prefix'; detail.prefix = '- '; detail.placeholder = 'item'
      break
    case 'ol':
      detail.action = 'prefix'; detail.prefix = '1. '; detail.placeholder = 'item'
      break
    case 'task':
      detail.action = 'prefix'; detail.prefix = '- [ ] '; detail.placeholder = 'task'
      break
    case 'link':
      detail.action = 'wrap'; detail.wrapper = { left: '[', right: '](https://)' }; detail.placeholder = 'link text'
      break
    case 'image':
      detail.action = 'wrap'; detail.wrapper = { left: '![', right: '](https://)' }; detail.placeholder = 'alt text'
      break
    case 'table':
      detail.action = 'insert'
      detail.placeholder = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n\n'
      break
    case 'hr':
      detail.action = 'insert'
      detail.placeholder = '\n---\n\n'
      break
  }
  return detail
}
