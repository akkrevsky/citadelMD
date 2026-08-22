declare module 'prismjs' {
  interface PrismGrammar {
    [key: string]: unknown
  }

  interface Prism {
    highlight(code: string, grammar: PrismGrammar, language: string): string
    languages: Record<string, PrismGrammar>
  }

  const Prism: Prism
  export default Prism
}

declare module 'prismjs/components/prism-python'
declare module 'prismjs/components/prism-bash'
declare module 'prismjs/components/prism-json'
declare module 'prismjs/components/prism-markdown'
