import 'dotenv/config'
import { startServer } from './server.js'

startServer().catch((err) => {
  console.error('[yjs-server] startup error:', err)
  process.exit(1)
})
