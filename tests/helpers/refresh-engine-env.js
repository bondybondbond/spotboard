// Loads public/utils/refresh-engine.js (a plain browser <script>, not a module) into the Node
// global scope of the jsdom test environment, exactly as dashboard.html loads it: after
// dom-cleanup's exports are on the global object (window globals in the browser) and after
// fingerprint.js. Lets tests drive refreshComponent()/_finalizeSuccess()/applyRefreshResult()
// with stubs instead of a live browser (#96).
import vm from 'node:vm'
import fs from 'node:fs'
import { installDomEnv } from './env.js'

let loaded = false

export async function loadRefreshEngine() {
  if (loaded) return globalThis
  installDomEnv()
  const domCleanup = await import('../../.test-build/utils/dom-cleanup.js')
  Object.assign(globalThis, domCleanup) // the IIFE footer does Object.assign(window, DomCleanup)
  vm.runInThisContext('var DEBUG = false;')
  for (const file of ['public/utils/fingerprint.js', 'public/utils/refresh-engine.js']) {
    vm.runInThisContext(fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), { filename: file })
  }
  loaded = true
  return globalThis
}
