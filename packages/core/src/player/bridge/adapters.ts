/**
 * Provider adapters for the frame script, as JS object-literal source: they
 * run inside the embed's frame, not in the app (ES5 only, for older TV
 * WebViews). See frameScript.ts for the contract and
 * docs/superpowers/spikes/2026-10-12-embed-bridge-probe.md for where each
 * one's selectors come from.
 */
export const PROVIDER_ADAPTERS: string[] = []
