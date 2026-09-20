import app from '../server/app.js'

export default function handler(request, response) {
  // Vercel's rewrite passes the original API suffix through this query value.
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
