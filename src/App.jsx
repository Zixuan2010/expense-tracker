import { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase.js'

const API_URL = '/api/expenses'
const emptyForm = { amount: '', category: 'Food', date: '', note: '' }
const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
const displayDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

async function apiFetch(user, url, options = {}) {
  const token = await user.getIdToken()
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  })
}

function ExpenseTracker({ user }) {
  const [expenses, setExpenses] = useState([])
  const [status, setStatus] = useState('loading')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    apiFetch(user, API_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load expenses')
        return response.json()
      })
      .then((data) => { setExpenses(data); setStatus('ready') })
      .catch((error) => { if (error.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [user])

  const total = useMemo(() => expenses.reduce((sum, expense) => sum + expense.amount, 0), [expenses])
  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setMessage('')
  }

  function startEditing(expense) {
    setEditingId(expense.id)
    setForm({ amount: String(expense.amount), category: expense.category, date: expense.date, note: expense.note })
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitExpense(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const response = await apiFetch(user, editingId ? `${API_URL}/${editingId}` : API_URL, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) throw new Error('Save failed')
      const savedExpense = await response.json()
      setExpenses((current) => editingId
        ? current.map((expense) => expense.id === editingId ? savedExpense : expense)
        : [savedExpense, ...current])
      setForm(emptyForm)
      setEditingId(null)
      setMessage(editingId ? 'Expense updated.' : 'Expense added.')
    } catch {
      setMessage('Could not save the expense. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function removeExpense(expense) {
    if (!window.confirm(`Delete “${expense.note}”?`)) return
    try {
      const response = await apiFetch(user, `${API_URL}/${expense.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Delete failed')
      setExpenses((current) => current.filter((item) => item.id !== expense.id))
      if (editingId === expense.id) resetForm()
      setMessage('Expense deleted.')
    } catch {
      setMessage('Could not delete the expense. Please try again.')
    }
  }

  return (
    <main className="app-shell">
      <section className="tracker" aria-labelledby="page-title">
        <header className="topbar">
          <div><p className="eyebrow">Expense tracker</p><h1 id="page-title">Daily expenses</h1></div>
          <div className="total-card" aria-live="polite"><span>Total spent</span><strong>{status === 'loading' ? '—' : currency.format(total)}</strong></div>
        </header>

        <div className="account-bar"><span>Signed in as <strong>{user.displayName || user.email || 'Account'}</strong></span><button type="button" onClick={() => signOut(auth)}>Sign out</button></div>

        <form className="expense-form" onSubmit={submitExpense}>
          <div className="form-header"><h2>{editingId ? 'Edit expense' : 'Add an expense'}</h2>{editingId && <button className="text-button" type="button" onClick={resetForm}>Cancel</button>}</div>
          <div className="form-grid">
            <label>Amount<input name="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={updateField} placeholder="0.00" required /></label>
            <label>Category<input name="category" value={form.category} onChange={updateField} placeholder="Food" required /></label>
            <label>Date<input name="date" type="date" value={form.date} onChange={updateField} required /></label>
            <label className="note-field">Note<input name="note" value={form.note} onChange={updateField} placeholder="What was it for?" required /></label>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add expense'}</button>
          </div>
        </form>

        {message && <p className="message" role="status">{message}</p>}
        <div className="list-heading"><h2>Recent activity</h2>{status === 'ready' && <span>{expenses.length} transactions</span>}</div>
        {status === 'loading' && <div className="state-card" role="status"><span className="spinner" aria-hidden="true" /><p>Loading expenses…</p></div>}
        {status === 'error' && <div className="state-card error" role="alert"><p>Could not load your expenses. Check that the server is running, then refresh this page.</p></div>}
        {status === 'ready' && expenses.length === 0 && <div className="state-card"><p>No expenses yet. Add your first one above.</p></div>}

        {status === 'ready' && expenses.length > 0 && (
          <ul className="expense-list">
            {expenses.map((expense) => (
              <li className="expense" key={expense.id}>
                <div className="category-icon" aria-hidden="true">{expense.category.charAt(0).toUpperCase()}</div>
                <div className="expense-main">
                  <div className="expense-title"><h3>{expense.note}</h3><strong>{currency.format(expense.amount)}</strong></div>
                  <div className="expense-meta"><span>{expense.category}</span><span aria-hidden="true">•</span><time dateTime={expense.date}>{displayDate.format(new Date(`${expense.date}T00:00:00Z`))}</time></div>
                </div>
                <div className="expense-actions"><button type="button" onClick={() => startEditing(expense)}>Edit</button><button className="delete-button" type="button" onClick={() => removeExpense(expense)}>Delete</button></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function authMessage(error) {
  switch (error.code) {
    case 'auth/invalid-email': return 'Enter a valid email address.'
    case 'auth/weak-password': return 'Choose a password with at least 6 characters.'
    case 'auth/email-already-in-use': return 'That account already exists. Check your password or use “Forgot password?”.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'The email or password is incorrect. Try again or reset your password.'
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a little and try again.'
    case 'auth/popup-closed-by-user': return 'The Google sign-in window was closed before you finished.'
    case 'auth/popup-blocked': return 'Your browser blocked the Google sign-in window. Please allow pop-ups and try again.'
    case 'auth/account-exists-with-different-credential': return 'This email uses a different sign-in method. Try the email form.'
    case 'auth/network-request-failed': return 'Could not connect. Check your internet connection and try again.'
    case 'auth/operation-not-allowed': return 'This sign-in method is not enabled yet. Please contact the app owner.'
    default: return 'Something went wrong. Please try again.'
  }
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleEmail(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (resetMode) {
        await sendPasswordResetEmail(auth, email.trim())
        setMessage('If an account exists for that email, a password reset link is on its way.')
      } else {
        try {
          await signInWithEmailAndPassword(auth, email.trim(), password)
        } catch (signInError) {
          if (signInError.code !== 'auth/user-not-found' && signInError.code !== 'auth/invalid-credential') throw signInError
          await createUserWithEmailAndPassword(auth, email.trim(), password)
        }
      }
    } catch (authError) {
      setError(authMessage(authError))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (authError) {
      setError(authMessage(authError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Expense tracker</p>
        <h1 id="login-title">{resetMode ? 'Reset your password' : 'Welcome back'}</h1>
        <p className="login-intro">{resetMode ? 'Enter your email and we’ll send a reset link.' : 'Sign in to see your expenses. If your email is new, we’ll create an account.'}</p>
        {!resetMode && <button className="google-button" type="button" onClick={handleGoogle} disabled={busy}>Sign in with Google</button>}
        {!resetMode && <div className="login-divider"><span>or continue with email</span></div>}
        <form className="login-form" onSubmit={handleEmail}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {!resetMode && <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : resetMode ? 'Send reset link' : 'Continue with email'}</button>
        </form>
        {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
        {message && <p className="auth-feedback" role="status">{message}</p>}
        {resetMode
          ? <a className="auth-link" href="#sign-in" onClick={(event) => { event.preventDefault(); setResetMode(false); setError(''); setMessage('') }}>Back to sign in</a>
          : <a className="auth-link" href="#forgot-password" onClick={(event) => { event.preventDefault(); setResetMode(true); setError(''); setMessage('') }}>Forgot password?</a>}
      </section>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser)
    setReady(true)
  }), [])

  if (!ready) return <main className="login-shell"><div className="state-card" role="status"><span className="spinner" aria-hidden="true" /><p>Checking sign-in…</p></div></main>
  return user ? <ExpenseTracker key={user.uid} user={user} /> : <LoginPage />
}

export default App
