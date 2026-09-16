import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createIndexRenderer } from './seo'

const TEMPLATE = `<!doctype html><html><head>
    <meta name="description" content="Generic app description" />
    <title>getfreefolio</title>
  </head><body><div id="root"></div></body></html>`

describe('createIndexRenderer', () => {
  let render: (p: string) => string
  beforeAll(() => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ff-seo-')), 'index.html')
    fs.writeFileSync(file, TEMPLATE)
    render = createIndexRenderer(file)
  })

  it('injects page-specific head tags for calculator pages', () => {
    const html = render('/calculators/fire')
    expect(html).toContain('<title>FIRE Calculator — When Can You Retire Early? | getfreefolio</title>')
    expect(html).toContain('<link rel="canonical" href="https://getfreefolio.com/calculators/fire" />')
    expect(html).toContain('property="og:title"')
    expect(html.match(/name="description"/g)).toHaveLength(1) // replaced, not duplicated
    expect(html).not.toContain('Generic app description')
    expect(html).toContain('<div id="root"></div>')
  })

  it('normalizes trailing slashes', () => {
    expect(render('/calculators/coast-fire/')).toContain('Coast FIRE Calculator')
  })

  it('serves the plain template for other routes', () => {
    expect(render('/')).toBe(TEMPLATE)
    expect(render('/debts')).toBe(TEMPLATE)
    expect(render('/calculators/unknown')).toBe(TEMPLATE)
  })
})
