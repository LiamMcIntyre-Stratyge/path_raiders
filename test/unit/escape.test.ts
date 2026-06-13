import { describe, expect, it } from 'vitest'
import { esc } from '../../src/lib/escapeHtml'

describe('esc', () => {
  it('escapes < and >', () => {
    expect(esc('<b>')).toBe('&lt;b&gt;')
  })

  it('escapes & first (no double-escaping)', () => {
    expect(esc('a & b')).toBe('a &amp; b')
  })

  it('escapes "', () => {
    expect(esc('"val"')).toBe('&quot;val&quot;')
  })

  it("escapes '", () => {
    expect(esc("it's")).toBe('it&#39;s')
  })

  it('returns plain strings unchanged', () => {
    expect(esc('hello')).toBe('hello')
  })

  it('escapes an XSS payload so no raw < survives', () => {
    expect(esc('<script>alert(1)</script>')).not.toContain('<')
  })
})
