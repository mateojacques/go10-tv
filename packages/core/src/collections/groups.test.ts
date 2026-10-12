import { describe, expect, it } from 'vitest'
import { collectionOf } from '../tv/testing'
import { collectionGroup, splitByGroup } from './groups'

describe('collectionGroup', () => {
  it('defaults to network', () => {
    expect(collectionGroup(collectionOf('cn', ['x']))).toBe('network')
    expect(collectionGroup({ ...collectionOf('db', ['x']), group: 'franchise' })).toBe('franchise')
  })
})

describe('splitByGroup', () => {
  it('splits keeping order, and leaves a group empty when nothing is in it', () => {
    const cn = collectionOf('cn', ['x'])
    const db = { ...collectionOf('db', ['x']), group: 'franchise' as const }
    const jx = collectionOf('jx', ['x'])
    expect(splitByGroup([cn, db, jx], collectionGroup)).toEqual({ network: [cn, jx], franchise: [db] })
    expect(splitByGroup([cn], collectionGroup)).toEqual({ network: [cn], franchise: [] })
  })
})
