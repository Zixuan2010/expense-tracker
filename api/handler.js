import app from '../server/app.js'

// One Vercel function handles every /api route.

export default function handler(request, response) {
  // Vercel exposes the captured rewrite segment as request.query.route.
  // Local Vite requests reach the Express app directly and need no rewrite.
  const original = new URL(request.url, 'http://localhost')
  const route = request.query?.route ?? original.searchParams.get('route')
  if (typeof route === 'string') {
    const safePath = route.split('/').map(encodeURIComponent).join('/')
    const search = new URLSearchParams(original.search)
    search.delete('route')
    request.url = `/api/${safePath}${search.size ? `?${search}` : ''}`
  }
  return app(request, response)
}
