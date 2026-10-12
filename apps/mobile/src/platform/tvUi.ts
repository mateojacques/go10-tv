import { Platform } from 'react-native'
import { appExtra } from '../config/appConfig'

/** The TV player UI: on a TV, or on a phone build made with GO10_FORCE_TV_UI=1 to test it over adb. */
export function isTvUi(): boolean {
  return Platform.isTV || appExtra().forceTvUi === true
}
