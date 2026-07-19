import 'dotenv/config'
import { startServer } from './server.js'

startServer().catch((err) => {
  console.error('Failed to start backend:', err)
  process.exit(1)
})
