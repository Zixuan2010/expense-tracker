import app, { initializeDatabase } from './app.js'

const port = Number(process.env.PORT || 3001)

initializeDatabase()
  .then(() => app.listen(port, () => console.log(`Expense API listening on http://localhost:${port}`)))
  .catch((error) => {
    console.error('Could not connect to Turso or initialize the expenses table:', error)
    process.exitCode = 1
  })
