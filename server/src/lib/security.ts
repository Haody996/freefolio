import { RequestHandler } from 'express'

// Security headers. The app loads Google Identity Services (sign-in) and Google
// Fonts, and shows coin logos from CoinGecko, so those are allowed explicitly.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  // Inline styles: the UI styles elements directly and Tailwind injects a
  // stylesheet; Google sign-in loads its own stylesheet.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:", // coin logos and other remote icons
  "connect-src 'self' https://accounts.google.com",
  "frame-src https://accounts.google.com", // Google sign-in
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups') // Google sign-in popup
  // Only over HTTPS (behind nginx, which terminates TLS).
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }
  res.setHeader('Content-Security-Policy', CSP)
  next()
}
