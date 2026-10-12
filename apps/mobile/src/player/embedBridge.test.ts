// The module is looked up at import time, so the stub lives inside the factory.
jest.mock('expo', () => {
  const native = { install: jest.fn(), tap: jest.fn(() => Promise.resolve(true)), webViewVersion: jest.fn(() => '129.0') }
  return { requireOptionalNativeModule: () => native, mockNative: native }
})

import { installBridge, tapWebView, webViewVersion } from './embedBridge'

const { mockNative } = jest.requireMock('expo')

beforeEach(() => jest.clearAllMocks())

it('installs through the native module', async () => {
  mockNative.install.mockResolvedValue('installed')
  await expect(installBridge(12, 'js', ['https://ok.ru'])).resolves.toBe('installed')
  expect(mockNative.install).toHaveBeenCalledWith(12, 'js', ['https://ok.ru'])
})

it('reports noView without a tag and error when the native call throws', async () => {
  await expect(installBridge(null, 'js', [])).resolves.toBe('noView')
  mockNative.install.mockRejectedValue(new Error('x'))
  await expect(installBridge(1, 'js', [])).resolves.toBe('error')
})

it('taps and reports the WebView version', () => {
  tapWebView(3, 10, 20)
  expect(mockNative.tap).toHaveBeenCalledWith(3, 10, 20)
  expect(webViewVersion()).toBe('129.0')
})
