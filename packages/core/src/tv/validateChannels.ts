import type { Title } from '../types'
import type { Collection } from '../collections/types'
import { buildChannelPlan } from './plan'
import type { ChannelConfig } from './types'

/** Omit either to validate structure only, as the app does at runtime before the catalog loads. */
export interface ChannelValidationContext {
  collections?: Collection[]
  titles?: Title[]
}

const FILE = 'channels.json'
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** An instant, not a local time: every viewer must share it. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Problems with the file's own fields (not its channels). */
export function validateChannelsTop(raw: unknown): string[] {
  if (!isObject(raw)) return [`${FILE}: must be a JSON object`]
  const errors: string[] = []
  if (typeof raw.epoch !== 'string' || !INSTANT.test(raw.epoch) || Number.isNaN(Date.parse(raw.epoch))) {
    errors.push(`${FILE}: epoch must be an ISO-8601 instant with a time zone, like 2026-10-01T00:00:00Z`)
  }
  if (typeof raw.defaultChannel !== 'string') errors.push(`${FILE}: defaultChannel must be a string`)
  if (!Array.isArray(raw.channels) || raw.channels.length === 0) errors.push(`${FILE}: channels must be a non-empty array`)
  return errors
}

/** Problems with one channel entry; catalog checks only when `ctx` has the data. */
export function validateChannelEntry(entry: unknown, index: number, ctx: ChannelValidationContext): string[] {
  const where = `${FILE}: channels[${index}]`
  if (!isObject(entry)) return [`${where}: must be an object`]
  const errors: string[] = []
  const fail = (message: string) => errors.push(`${where}: ${message}`)

  if (typeof entry.id !== 'string' || !KEBAB.test(entry.id)) fail('id must be a kebab-case string')
  if (!Number.isInteger(entry.number) || (entry.number as number) < 1) fail('number must be a positive integer')
  if (typeof entry.collection !== 'string') fail('collection must be a string')
  if (entry.name !== undefined && (typeof entry.name !== 'string' || entry.name.trim() === '')) {
    fail('name must be a non-empty string when present')
  }
  if (
    entry.blockMinutes !== undefined &&
    (!Number.isInteger(entry.blockMinutes) || (entry.blockMinutes as number) < 5 || (entry.blockMinutes as number) > 240)
  ) {
    fail('blockMinutes must be an integer from 5 to 240')
  }
  if (entry.exclude !== undefined && (!Array.isArray(entry.exclude) || entry.exclude.some((k) => typeof k !== 'string'))) {
    fail('exclude must be an array of title keys')
  }
  if (errors.length > 0 || !ctx.collections) return errors

  const config = entry as unknown as ChannelConfig
  const named = `${FILE}: channels[${index}] (${config.id})`
  const collection = ctx.collections.find((c) => c.id === config.collection)
  if (!collection) return [`${named}: unknown collection "${config.collection}"`]
  for (const key of config.exclude ?? []) {
    if (!collection.titles.includes(key)) errors.push(`${named}: exclude key "${key}" is not in collection "${collection.id}"`)
  }
  if (ctx.titles && buildChannelPlan(config, collection, ctx.titles).titles.length === 0) {
    errors.push(`${named}: nothing in collection "${collection.id}" can air`)
  }
  return errors
}

/** Every problem with the file, as `channels.json: …` strings. Takes raw JSON: imported JSON is never type-checked. */
export function validateChannels(raw: unknown, ctx: ChannelValidationContext): string[] {
  const errors = validateChannelsTop(raw)
  if (!isObject(raw) || !Array.isArray(raw.channels)) return errors
  const channels: unknown[] = raw.channels
  channels.forEach((entry, index) => errors.push(...validateChannelEntry(entry, index, ctx)))

  const seen = (field: 'id' | 'number') => {
    const counts = new Map<unknown, number>()
    for (const entry of channels) if (isObject(entry)) counts.set(entry[field], (counts.get(entry[field]) ?? 0) + 1)
    for (const [value, count] of counts) {
      if (count > 1) errors.push(`${FILE}: ${field} ${field === 'id' ? `"${value}"` : value} is used by more than one channel`)
    }
  }
  seen('id')
  seen('number')

  const ids = channels.flatMap((entry) => (isObject(entry) && typeof entry.id === 'string' && KEBAB.test(entry.id) ? [entry.id] : []))
  if (typeof raw.defaultChannel === 'string' && !ids.includes(raw.defaultChannel)) {
    errors.push(`${FILE}: defaultChannel "${raw.defaultChannel}" is not a listed channel`)
  }
  return errors
}
