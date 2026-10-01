import { useCallback } from 'react'
import { useTv } from './TvProvider'
import { TvSlot, type SlotHandle } from './TvSlot'
import { TvDebugPanel } from './debugLog'

/** Every live slot, plus the mini-player's controls. Mounted once at the App root. */
export function TvLayer({ onOpen }: { onOpen: (channelId: string) => void }) {
  const tv = useTv()
  const { lineup } = tv
  if (!lineup) return null
  const main = tv.slots.find((s) => s.role === 'main')
  const mini = main && tv.modeOf(main) === 'mini' ? lineup.channels.find((c) => c.id === main.channelId) : undefined

  return (
    <div className="go-tvlayer">
      {tv.slots.map((slot) => {
        const channel = lineup.channels.find((c) => c.id === slot.channelId)
        if (!channel) return null
        const mode = tv.modeOf(slot)
        return (
          <BoundSlot
            key={slot.id}
            slotId={slot.id}
            channel={channel}
            epochMs={lineup.epochMs}
            mode={mode}
            rect={mode === 'tile' ? tv.previewRect : null}
            preview={slot.role === 'preview'}
          />
        )
      })}
      <TvDebugPanel />
      {mini && (
        <div className="go-tvmini">
          <button type="button" className="go-tvmini_open" aria-label={`Volver a ${mini.name} en TV`} onClick={() => onOpen(mini.id)} />
          <span className="go-tvmini_name">
            <span className="go-tvmini_live" aria-hidden="true" />
            {mini.number} · {mini.name}
          </span>
          <button type="button" className="go-tvmini_close" aria-label="Cerrar TV" onClick={tv.close}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function BoundSlot({ slotId, ...props }: { slotId: number } & Omit<Parameters<typeof TvSlot>[0], 'bind' | 'onLoaded' | 'onReady' | 'onFailedChange' | 'onStalledChange'>) {
  const tv = useTv()
  const { bindHandle, onSlotLoaded, onSlotFailed, onSlotStalled } = tv
  const bind = useCallback((handle: SlotHandle | null) => bindHandle(slotId, handle), [bindHandle, slotId])
  const onLoaded = useCallback(() => onSlotLoaded(slotId), [onSlotLoaded, slotId])
  const onFailedChange = useCallback((failed: boolean) => onSlotFailed(slotId, failed), [onSlotFailed, slotId])
  const onStalledChange = useCallback((stalled: boolean) => onSlotStalled(slotId, stalled), [onSlotStalled, slotId])
  // The embed's first message is the surer moment to ask for sound than onLoad.
  return <TvSlot {...props} bind={bind} onLoaded={onLoaded} onReady={onLoaded} onFailedChange={onFailedChange} onStalledChange={onStalledChange} />
}
