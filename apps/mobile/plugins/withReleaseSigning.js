// CommonJS: Expo loads config plugins without transpiling them.
const { withAppBuildGradle } = require('expo/config-plugins')

const MARKER = '// go10: release signing'

const RELEASE_CONFIG = `        release {
            ${MARKER} — from ~/.gradle/gradle.properties, never from the repo.
            if (project.hasProperty('GO10_RELEASE_STORE_FILE')) {
                storeFile file(GO10_RELEASE_STORE_FILE)
                storePassword GO10_RELEASE_STORE_PASSWORD
                keyAlias GO10_RELEASE_KEY_ALIAS
                keyPassword GO10_RELEASE_KEY_PASSWORD
            }
        }
`

/**
 * The template signs release builds with the debug key. This adds a
 * `release` signing config read from Gradle properties and points the
 * release build type at it — so a release build without the properties
 * fails instead of shipping debug-signed.
 * @param {string} gradle android/app/build.gradle
 * @returns {string}
 */
function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle
  const debugConfig = /( {8}debug \{\n {12}storeFile file\('debug\.keystore'\)[\s\S]*?\n {8}\}\n)/
  if (!debugConfig.test(gradle)) throw new Error('withReleaseSigning: no debug entry in signingConfigs to add release after')
  const releaseType = /( {8}release \{\n(?: {12}\/\/[^\n]*\n)*) {12}signingConfig signingConfigs\.debug\n/
  if (!releaseType.test(gradle)) throw new Error('withReleaseSigning: release buildType does not use signingConfigs.debug')
  return gradle
    .replace(debugConfig, `$1${RELEASE_CONFIG}`)
    .replace(releaseType, '$1            signingConfig signingConfigs.release\n')
}

/** @param {import('expo/config').ExpoConfig} config */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = addReleaseSigning(mod.modResults.contents)
    return mod
  })
}

module.exports = withReleaseSigning
module.exports.addReleaseSigning = addReleaseSigning
