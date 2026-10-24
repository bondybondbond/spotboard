// #224: finished work belongs in the NEXT unreleased changelog block. Real CHANGELOG.md must pass;
// planted placements (the #220 / #221 mistake) must fail; a deliberate hold must pass.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { checkChangelog } from '../scripts/changelog-release-target.js'

const doc = (...blocks) => `# SpotBoard Changelog\n\n${blocks.join('\n\n')}\n`
const released = '## [1.4.5] - 2026-10-16\n\n### Fixed\n\n- **Old** (#200): shipped.'
const next = '## [1.4.6] - Unreleased\n\n### Fixed\n\n- **Fine** (#998): next release.'

test('the real CHANGELOG.md has no entry under a later release than the next one', () => {
  const text = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
  assert.deepEqual(checkChangelog(text), [])
})

test('an entry under a new later block fails (the #220 / #221 mistake)', () => {
  const problems = checkChangelog(doc(
    '## [1.4.7] - Unreleased\n\n### Fixed\n\n- **Planted** (#999): wrong block.',
    next,
    released,
  ))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /line \d+ sits under \[1\.4\.7\].*\[1\.4\.6\]/)
})

test('a later block with a stated release constraint passes', () => {
  const held = '- **Held** (#997): waits. <!-- hold: needs the 1.4.6 review result before it can ship -->'
  assert.deepEqual(checkChangelog(doc(`## [1.4.7] - Unreleased\n\n### Fixed\n\n${held}`, next, released)), [])
})

test('a hold marker with no real reason does not count', () => {
  for (const reason of ['later', '', 'not ready yet', 'wait for later', 'some other reason', 'deliver it later']) {
    const entry = `- **Vague** (#996): waits. <!-- hold: ${reason} -->`
    const problems = checkChangelog(doc(`## [1.4.7] - Unreleased\n\n${entry}`, next, released))
    assert.equal(problems.length, 1, `reason "${reason}" should not pass`)
  }
})

test('an entry under a non-version heading is not attributed to the block above it', () => {
  const problems = checkChangelog(doc(
    `${next}\n\n## Notes\n\n- a plain list item`,
    '## [1.4.7] - Unreleased\n\n- **Planted** (#999): wrong block.',
    released,
  ))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /sits under \[1\.4\.7\]/)
})

test('an Unreleased heading with no version fails instead of hiding its entries', () => {
  const problems = checkChangelog(doc(`## [Unreleased]\n\n- **Hidden** (#992): no version.\n\n${next}`, released))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /Unreleased heading with no version/)
})

test('a version skipped on purpose passes once it has its own heading', () => {
  assert.deepEqual(checkChangelog(doc(
    '## [1.4.7] - Unreleased\n\n- **Fine** (#998): next.',
    '## [1.4.6] - Withdrawn\n\n- **Gone** (#1): not shipped.',
    released,
  )), [])
})

test('a lone Unreleased block that skips the next version fails', () => {
  const problems = checkChangelog(doc('## [1.4.7] - Unreleased\n\n- **Skipped** (#995): no 1.4.6 block.', released))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /last released version is 1\.4\.5/)
})

test('minor and major bumps count as the next release; no Unreleased block passes', () => {
  assert.deepEqual(checkChangelog(doc('## [1.5.0] - Unreleased\n\n- **Minor** (#994): ok.', released)), [])
  assert.deepEqual(checkChangelog(doc('## [2.0.0] - Unreleased\n\n- **Major** (#993): ok.', released)), [])
  assert.deepEqual(checkChangelog(doc(released)), [])
})
