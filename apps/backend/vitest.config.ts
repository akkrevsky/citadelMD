import { defineConfig } from 'vitest/config'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const infraEnvPath = resolve(__dirname, '../../infra/.env')
const dotenv = readFileSync(infraEnvPath, 'utf-8')

function get(key: string): string {
  const line = dotenv.split('\n').find((l) => l.startsWith(key + '='))
  return line ? line.split('=').slice(1).join('=').trim() : ''
}

const pgPassword = get('POSTGRES_PASSWORD')

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: `postgresql://mdcollab:${pgPassword}@postgres:5432/mdcollab`,
      JWT_SECRET: get('JWT_SECRET') || 'test-jwt-secret-at-least-32-chars!!',
    },
  },
})
