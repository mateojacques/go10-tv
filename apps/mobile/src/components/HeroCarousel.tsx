import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, AppState, FlatList, Platform, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import type { HeroSlide } from '@go10/core/hero/pickHero'
import type { Progress } from '@go10/core/progress/progressStore'
import { titleProgress } from '@go10/core/progress/titleProgress'
import type { CatalogRow, Title } from '@go10/core/types'
import { useRemoteKeys } from '../platform/remote'
import { theme } from '../theme'
import { Hero } from './Hero'
import { edgeStep } from './heroEdge'

export const SLIDE_MS = 8000
const tv = Platform.isTV

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let live = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => live && setReduced(value))
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      live = false
      subscription.remove()
    }
  }, [])
  return reduced
}

// Only a known background/inactive state pauses: at launch Android can report 'unknown' (or nothing yet).
const isActive = (state: unknown) => state !== 'background' && state !== 'inactive'

function useAppActive(): boolean {
  const [active, setActive] = useState(() => isActive(AppState.currentState))
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(isActive(state)))
    return () => subscription.remove()
  }, [])
  return active
}

/**
 * The Home hero carousel. Phone: a swipeable pager of Heroes. TV: one Hero
 * whose props swap behind a short fade, so the focused button never unmounts.
 * Advances every SLIDE_MS; any slide change restarts the wait.
 */
export function HeroCarousel({ slides, imageBase, progress, onPlayTitle, onSelectTitle }: {
  slides: HeroSlide[]
  imageBase: string
  progress: Record<string, Progress>
  onPlayTitle: (title: Title, row: CatalogRow) => void
  onSelectTitle: (title: Title) => void
}) {
  const { width } = useWindowDimensions()
  const [index, setIndex] = useState(0)
  const [touching, setTouching] = useState(false)
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set())
  const reduced = useReducedMotion()
  const appActive = useAppActive()
  const pager = useRef<FlatList<HeroSlide>>(null)
  const count = slides.length

  const go = useCallback((to: number) => {
    const next = ((to % count) + count) % count
    setIndex(next)
    if (!tv) pager.current?.scrollToIndex({ index: next, animated: !reduced })
  }, [count, reduced])

  useEffect(() => {
    if (count < 2 || touching || reduced || !appActive) return
    const timer = setTimeout(() => go(index + 1), SLIDE_MS)
    return () => clearTimeout(timer)
  }, [index, count, touching, reduced, appActive, go])

  // TV: which hero button holds focus, read at key-down (see edgeStep).
  const focused = useRef<'play' | 'info' | null>(null)
  useRemoteKeys((key) => {
    if (!tv || count < 2) return
    const step = edgeStep(key, focused.current)
    if (step !== 0) go(index + step)
  })

  const heroFor = (slide: HeroSlide, i: number) => {
    const tp = titleProgress(slide.title, progress)
    return (
      <Hero
        title={slide.title}
        art={failed.has(i) ? null : slide.art}
        imageBase={imageBase}
        progress={tp}
        onPlay={() => onPlayTitle(slide.title, tp.row)}
        onInfo={() => onSelectTitle(slide.title)}
        onArtError={() => setFailed((f) => new Set(f).add(i))}
        onFocusButton={(button) => {
          focused.current = button
        }}
      />
    )
  }

  // TV: fade out, swap, fade in.
  const [shown, setShown] = useState(0)
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!tv || shown === index) return
    if (reduced) {
      setShown(index)
      return
    }
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setShown(index)
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
    })
  }, [index, shown, reduced, opacity])

  const a11y = { accessibilityRole: 'adjustable' as const, accessibilityValue: { min: 1, max: count, now: index + 1 } }

  if (tv) {
    return (
      <Animated.View testID="hero-carousel" {...a11y} style={{ opacity }}>
        {heroFor(slides[shown], shown)}
        {count > 1 && <Dots count={count} index={shown} />}
      </Animated.View>
    )
  }

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent
    setIndex(Math.round(contentOffset.x / layoutMeasurement.width))
  }

  return (
    <View
      testID="hero-carousel"
      {...a11y}
      onTouchStart={() => setTouching(true)}
      onTouchEnd={() => setTouching(false)}
      onTouchCancel={() => setTouching(false)}
    >
      <FlatList
        testID="hero-pager"
        ref={pager}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(slide) => slide.title.key}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={count}
        onMomentumScrollEnd={onMomentumScrollEnd}
        renderItem={({ item, index: i }) => <View style={{ width }}>{heroFor(item, i)}</View>}
      />
      {count > 1 && <Dots count={count} index={index} />}
    </View>
  )
}

function Dots({ count, index }: { count: number; index: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: 16, bottom: 12, flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: i === index ? theme.color.accent : 'rgba(242,244,240,0.25)' }} />
      ))}
    </View>
  )
}
