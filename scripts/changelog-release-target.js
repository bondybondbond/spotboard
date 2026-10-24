// Release-target check (#224): approved work enters the NEXT unreleased version (owner rule, 21 Oct),
// so a changelog entry under a later Unreleased block is a mistake unless it says why it must wait.
//
// "Next" = the successor of the highest RELEASED heading (patch+1, minor+1.0 or major+1.0.0). The
// lowest Unreleased block must be one of those; any other Unreleased block holds only entries that end
// with a hold marker naming the release constraint:
//   - **Title** (#123): text... <!-- hold: needs the 1.4.6 Web Store review before it can ship -->
// The marker is an HTML comment, so it never shows in the rendered notes. The reason needs 3+ words and
// must point at a release fact (a version, an issue number, or a release/review/store/submit/live/depends/blocked
// word); this is a heuristic against hollow reasons, not proof the constraint is real.
// If a version was skipped on purpose, give it a heading such as `## [1.4.6] - Withdrawn`.
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const HEADING = /^## \[(\d+)\.(\d+)\.(\d+)\](.*)$/
const HOLD = /<!--\s*hold:\s*(.*?)\s*-->\s*$/
const MIN_HOLD_WORDS = 3
const RELEASE_FACT = /\d+\.\d+|#\d+|\b(release|review|store|submit|live|depends|blocked)\b/i

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
const label = (v) => v.join('.')

export function checkChangelog(text) {
  const blocks = []
  const unversioned = []
  let current = null // entries under any other `## ` heading belong to no release block
  text.split(/\r?\n/).forEach((line, i) => {
    const m = HEADING.exec(line)
    if (m) {
      current = {
        version: [Number(m[1]), Number(m[2]), Number(m[3])],
        unreleased: /unreleased/i.test(m[4]),
        entries: [],
      }
      blocks.push(current)
    } else if (/^## /.test(line)) {
      // Used before 1.4.5; its entries would carry no version to compare, so refuse the heading itself
      if (/^## \[?unreleased\b/i.test(line)) unversioned.push(i + 1)
      current = null
    } else if (current && /^- /.test(line)) {
      current.entries.push({ line: i + 1, text: line })
    }
  })

  const problems = unversioned.map((n) =>
    `CHANGELOG.md line ${n} is an Unreleased heading with no version; write it as "## [x.y.z] - Unreleased" so entries can be checked.`
  )
  const unreleased =blocks.filter((b) => b.unreleased).sort((a, b) => cmp(a.version, b.version))
  if (!unreleased.length) return problems

  const released = blocks.filter((b) => !b.unreleased).map((b) => b.version).sort(cmp)
  const top = released[released.length - 1]
  const next = unreleased[0]
  if (top) {
    const [ma, mi, pa] = top
    const allowed = [[ma, mi, pa + 1], [ma, mi + 1, 0], [ma + 1, 0, 0]]
    if (!allowed.some((v) => cmp(v, next.version) === 0)) {
      problems.push(
        `Lowest Unreleased block is [${label(next.version)}] but the last released version is ${label(top)}; ` +
        `the next release is one of ${allowed.map(label).join(', ')} (a version skipped on purpose needs a heading like "## [x.y.z] - Withdrawn").`
      )
    }
  }

  for (const block of unreleased.slice(1)) {
    for (const entry of block.entries) {
      const reason = HOLD.exec(entry.text)?.[1] ?? ''
      const words = reason.split(/\s+/).filter(Boolean).length
      if (words >= MIN_HOLD_WORDS && RELEASE_FACT.test(reason)) continue
      problems.push(
        `CHANGELOG.md line ${entry.line} sits under [${label(block.version)}] but the next release is ` +
        `[${label(next.version)}]. Move it there, or end the line with ` +
        `<!-- hold: the concrete release constraint (3+ words, naming a version, issue or release step) --> if it must wait.`
      )
    }
  }
  return problems
}

// CLI: node scripts/changelog-release-target.js  (exit 1 and list the problems on failure)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkChangelog(fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'))
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log('Changelog release target: OK')
}
