import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'

import authRoutes from './routes/auth'
import holdingsRoutes from './routes/holdings'
import networthRoutes from './routes/networth'
import pricesRoutes from './routes/prices'
import projectionRoutes from './routes/projection'
import profileRoutes from './routes/profile'
import { initScheduler } from './scheduler'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/holdings', holdingsRoutes)
app.use('/api/networth', networthRoutes)
app.use('/api/prices', pricesRoutes)
app.use('/api/projection', projectionRoutes)
app.use('/api/profile', profileRoutes)

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// Return JSON 404 for any unmatched /api/* route — prevents index.html being served as JSON
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }))

// Serve React build in production — client/dist sits two levels above dist/index.js
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist')
  app.use(express.static(clientDist))
  app.get('*splat', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  initScheduler().catch((err) => console.error('[scheduler] Init failed:', err))
})

export default app
