import express from 'express'
import { createClient } from '@libsql/client'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const app = express()
app.disable('x-powered-by')
let database
let firebaseAuth
let initialization

function getDatabase() {
  if (!database) {
    const url = process.env.TURSO_DATABASE_URL
    const authToken = process.env.TURSO_AUTH_TOKEN
    if (!url || !authToken) throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set')
    database = createClient({ url, authToken })
  }
  return database
}

function getFirebaseAuth() {
  if (!firebaseAuth) {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID
    if (!projectId) throw new Error('VITE_FIREBASE_PROJECT_ID must be set')
    firebaseAuth = getAuth(initializeApp({ projectId }))
  }
  return firebaseAuth
}

export function initializeDatabase() {
  if (!initialization) {
    initialization = (async () => {
      const db = getDatabase()
      await db.execute(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amount REAL NOT NULL CHECK (amount > 0),
          category TEXT NOT NULL,
          date TEXT NOT NULL,
          note TEXT NOT NULL,
          user_id TEXT
        ) STRICT
      `)

      const columns = await db.execute('PRAGMA table_info(expenses)')
      if (!columns.rows.some((column) => column.name === 'user_id')) {
        // Legacy rows remain unassigned rather than becoming visible to a new user.
        await db.execute('ALTER TABLE expenses ADD COLUMN user_id TEXT')
      }
      await db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC, id DESC)')
    })().catch((error) => {
      initialization = null
      throw error
    })
  }
  return initialization
}

const listSql = 'SELECT id, amount, category, date, note FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC'
const getSql = 'SELECT id, amount, category, date, note FROM expenses WHERE id = ? AND user_id = ?'
const createSql = 'INSERT INTO expenses (amount, category, date, note, user_id) VALUES (?, ?, ?, ?, ?)'
const updateSql = 'UPDATE expenses SET amount = ?, category = ?, date = ?, note = ? WHERE id = ? AND user_id = ?'
const deleteSql = 'DELETE FROM expenses WHERE id = ? AND user_id = ?'

function refuse(request, response, status, reason, message) {
  console.error(`Refused ${request.method} ${request.originalUrl}: ${reason}`)
  return response.status(status).json({ error: message })
}

function validateExpense(input) {
  const amount = Number(input.amount)
  const category = String(input.category ?? '').trim()
  const date = String(input.date ?? '').trim()
  const note = String(input.note ?? '').trim()
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (!category || !note || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { amount, category, date, note }
}

app.use('/api', async (request, response, next) => {
  const match = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '')
  if (!match) return refuse(request, response, 401, 'Missing or malformed Authorization bearer token', 'Please sign in again.')

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(match[1])
    if (!decoded.uid) throw new Error('Verified token has no uid')
    request.userId = decoded.uid
    next()
  } catch (error) {
    return refuse(request, response, 401, `Firebase ID token verification failed: ${error.code ?? error.name}: ${error.message}`, 'Your session could not be verified. Please sign in again.')
  }
})

app.use('/api', async (request, response, next) => {
  try {
    await initializeDatabase()
    next()
  } catch (error) {
    console.error(`Refused ${request.method} ${request.originalUrl}: database initialization failed:`, error)
    response.status(503).json({ error: 'Expense data is temporarily unavailable.' })
  }
})

app.use('/api', express.json({ limit: '1mb' }))

app.get('/api/expenses', async (request, response) => {
  const result = await getDatabase().execute({ sql: listSql, args: [request.userId] })
  response.json(result.rows)
})

app.post('/api/expenses', async (request, response) => {
  const expense = validateExpense(request.body ?? {})
  if (!expense) return refuse(request, response, 400, 'Invalid expense details', 'Invalid expense details')
  const result = await getDatabase().execute({ sql: createSql, args: [expense.amount, expense.category, expense.date, expense.note, request.userId] })
  const saved = await getDatabase().execute({ sql: getSql, args: [Number(result.lastInsertRowid), request.userId] })
  response.status(201).json(saved.rows[0])
})

app.put('/api/expenses/:id', async (request, response) => {
  const expense = validateExpense(request.body ?? {})
  if (!expense) return refuse(request, response, 400, 'Invalid expense details', 'Invalid expense details')
  const id = Number(request.params.id)
  if (!Number.isSafeInteger(id) || id < 1) return refuse(request, response, 404, 'Expense not found', 'Expense not found')
  const result = await getDatabase().execute({ sql: updateSql, args: [expense.amount, expense.category, expense.date, expense.note, id, request.userId] })
  if (result.rowsAffected === 0) return refuse(request, response, 404, `Expense ${id} not found for user ${request.userId}`, 'Expense not found')
  const saved = await getDatabase().execute({ sql: getSql, args: [id, request.userId] })
  response.json(saved.rows[0])
})

app.delete('/api/expenses/:id', async (request, response) => {
  const id = Number(request.params.id)
  if (!Number.isSafeInteger(id) || id < 1) return refuse(request, response, 404, 'Expense not found', 'Expense not found')
  const result = await getDatabase().execute({ sql: deleteSql, args: [id, request.userId] })
  if (result.rowsAffected === 0) return refuse(request, response, 404, `Expense ${id} not found for user ${request.userId}`, 'Expense not found')
  response.status(204).end()
})

app.use('/api', (request, response) => refuse(request, response, 404, 'Route not found', 'Route not found'))

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error)
  const badJson = error.type === 'entity.parse.failed'
  console.error(`Refused ${request.method} ${request.originalUrl}:`, error)
  response.status(badJson ? 400 : 500).json({ error: badJson ? 'Invalid JSON body.' : 'Something went wrong.' })
})

export default app
