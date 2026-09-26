import * as NavigationBar from 'expo-navigation-bar'
import * as ScreenOrientation from 'expo-screen-orientation'
import { useEffect } from 'react'
import { Platform } from 'react-native'

const ignore = () => {}

/**
 * Phone playback (spec: Player → Phone): landscape and immersive while the
 * player is on screen (the status bar is hidden by the player itself);
 * portrait and the system bars come back however it closes. A TV is left
 * exactly as it is.
 */
export function usePlayerChrome(tv: boolean = Platform.isTV): void {
  useEffect(() => {
    if (tv) return
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(ignore)
    NavigationBar.setVisibilityAsync('hidden').catch(ignore)
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(ignore)
      NavigationBar.setVisibilityAsync('visible').catch(ignore)
    }
  }, [tv])
}

/** The phone layouts are portrait (like the mobile web); only the player turns. */
export function usePortraitOnPhone(tv: boolean = Platform.isTV): void {
  useEffect(() => {
    if (!tv) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(ignore)
  }, [tv])
}
