jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }))

import { installBridge, tapWebView, webViewVersion } from './embedBridge'

it('degrades without the native module (older builds, tests)', async () => {
  await expect(installBridge(1, '', [])).resolves.toBe('noModule')
  expect(() => tapWebView(1, 0, 0)).not.toThrow()
  expect(webViewVersion()).toBe('?')
})
