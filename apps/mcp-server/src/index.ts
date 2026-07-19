import 'dotenv/config'
import { startServer } from './server.js'

startServer().catch((err) => {
  console.error('[mcp-server] startup error:', err)
  process.exit(1)
})
