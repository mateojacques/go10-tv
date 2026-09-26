// Screens read safe-area insets; the library's own mock supplies them in tests.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
