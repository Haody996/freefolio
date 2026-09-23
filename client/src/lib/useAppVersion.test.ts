import { describe, it, expect } from 'vitest'
import { assetName } from './useAppVersion'

describe('assetName', () => {
  it('pulls the hashed bundle name out of a script src', () => {
    expect(assetName('https://getfreefolio.com/assets/index-DmsqT4Md.js')).toBe('index-DmsqT4Md.js')
    expect(assetName('/assets/index-DmsqT4Md.js?v=2')).toBe('index-DmsqT4Md.js')
  })

  it('ignores anything that is not the entry bundle', () => {
    expect(assetName(undefined)).toBeNull()
    expect(assetName('')).toBeNull()
    expect(assetName('/assets/Dashboard-a1b2c3.js')).toBeNull()
    expect(assetName('/src/main.tsx')).toBeNull()
  })
})
