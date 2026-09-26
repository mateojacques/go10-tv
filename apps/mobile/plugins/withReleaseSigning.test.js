const { addReleaseSigning } = require('./withReleaseSigning')

// The shape of the template's android/app/build.gradle around signing.
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`

describe('addReleaseSigning', () => {
  it('adds a release signing config fed by Gradle properties', () => {
    const out = addReleaseSigning(TEMPLATE)
    expect(out).toContain("if (project.hasProperty('GO10_RELEASE_STORE_FILE')) {")
    expect(out).toContain('storeFile file(GO10_RELEASE_STORE_FILE)')
    expect(out).toContain('storePassword GO10_RELEASE_STORE_PASSWORD')
    expect(out).toContain('keyAlias GO10_RELEASE_KEY_ALIAS')
    expect(out).toContain('keyPassword GO10_RELEASE_KEY_PASSWORD')
  })

  it('signs release builds with the release config only', () => {
    const out = addReleaseSigning(TEMPLATE)
    const release = out.slice(out.indexOf('        release {\n            // Caution'))
    expect(release).toContain('signingConfig signingConfigs.release')
    expect(release).not.toContain('signingConfig signingConfigs.debug')
    // Debug builds keep the debug key.
    expect(out).toContain('        debug {\n            signingConfig signingConfigs.debug')
  })

  it('is idempotent', () => {
    const once = addReleaseSigning(TEMPLATE)
    expect(addReleaseSigning(once)).toBe(once)
  })

  it('refuses a build.gradle it does not recognise', () => {
    expect(() => addReleaseSigning('android {}')).toThrow(/signingConfigs/)
  })
})
