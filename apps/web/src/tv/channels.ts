const modules = import.meta.glob<unknown>('../../../../data/channels.json', { eager: true, import: 'default' })

/** `data/channels.json` as written; validated by `channels.data.test.ts`, resolved by `useLineup`. */
export const CHANNELS_FILE: unknown = Object.values(modules)[0] ?? null
