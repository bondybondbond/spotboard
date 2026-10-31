// #233: a Cricbuzz news card showed some stories with 280px pictures (captured, `preview`) and others with 180px
// pictures (`medium`) although every <img> declares 360x202. Capture measures layout; a refresh has none, so a story new
// since the capture fell to the height ladder (202px -> medium). Within one card, hero-tier pictures with the same declared
// size and role now share the highest of their tiers. The other half of the report -- the headline sitting BESIDE the
// picture -- is the dashboard/preview rule that stacks a picture-only link on its own line; its CSS must exist in both places.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { classifyImagesForRefresh } = await import('../.test-build/utils/dom-cleanup.js')

// Static fixture markup. `ctx` is the tier already stamped on the image (capture, or preserved by src from the saved card).
const story = (n, ctx, { w = 360, h = 202, linkCls = 'cursor-pointer rounded overflow-hidden relative' } = {}) =>
  `<div class="flex flex-col gap-2"><a href="/news/${n}" class="${linkCls}"><img alt="story ${n}" width="${w}" height="${h}" ` +
  `data-nimg="1" src="https://cdn.example.com/img/${n}.jpg" data-scale-context="${ctx}"></a>` +
  `<a class="text-base font-bold" href="/news/${n}">Headline ${n}</a></div>`

const tiers = html => [...classifyImagesForRefresh(html).matchAll(/data-scale-context="(\w+)"/g)].map(m => m[1])

test('#233: the reported card - 10 captured preview + 5 newer medium of identical 360x202 -> all preview', () => {
  const html = [...Array(15)].map((_, i) => story(i, [0, 1, 2, 3, 10].includes(i) ? 'medium' : 'preview')).join('')
  assert.deepEqual(tiers(html), Array(15).fill('preview'))
})

test('#233: a story new since the capture takes the card\'s existing tier (new story has no tier, ladder says medium)', () => {
  // the new story has no data-scale-context at all -> classifyImagesForRefresh gives it the ladder's medium, then the run lifts it
  const fresh = story(9, 'x').replace(' data-scale-context="x"', '')
  assert.deepEqual(tiers(story(1, 'preview') + story(2, 'preview') + fresh), ['preview', 'preview', 'preview'])
})

test('#233: a pair is enough - two same-size same-role pictures with different hero tiers agree', () => {
  assert.deepEqual(tiers(story(1, 'medium') + story(2, 'preview')), ['preview', 'preview'])
})

test('#233: negative - a lone picture, or a run that already agrees, is untouched', () => {
  assert.deepEqual(tiers(story(1, 'medium')), ['medium'])
  assert.deepEqual(tiers(story(1, 'medium') + story(2, 'medium')), ['medium', 'medium'])
})

test('#233: negative - different declared sizes are different roles and keep their own tiers', () => {
  assert.deepEqual(tiers(story(1, 'medium', { w: 300, h: 169 }) + story(2, 'preview')), ['medium', 'preview'])
})

test('#233: negative - same size but a different wrapper role keeps its own tier', () => {
  assert.deepEqual(tiers(story(1, 'medium', { linkCls: 'related' }) + story(2, 'preview')), ['medium', 'preview'])
})

test('#233: negative - a thumbnail of the same size and role is never promoted (live CNN card: thumbnail next to preview)', () => {
  assert.deepEqual(tiers(story(1, 'thumbnail') + story(2, 'preview')), ['thumbnail', 'preview'])
  assert.deepEqual(tiers(story(1, 'thumbnail') + story(2, 'medium')), ['thumbnail', 'medium'])
})

test('#233: negative - brand/sponsor roles and images with no declared size are skipped', () => {
  assert.deepEqual(tiers(story(1, 'medium', { linkCls: 'sponsor-logo' }) + story(2, 'preview', { linkCls: 'sponsor-logo' })), ['medium', 'preview'])
  const noSize = n => story(n, n === 1 ? 'medium' : 'preview').replace(/ width="360" height="202"/, '')
  assert.deepEqual(tiers(noSize(1) + noSize(2)), ['medium', 'preview'])
})

const dashboard = readFileSync(new URL('../public/dashboard.html', import.meta.url), 'utf8')
const content = readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8')

// The whole rule as written: both selectors, one declaration block that is exactly `display: block`, outside any comment.
const stackRule = css => {
  const m = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/((?:[.\w-]+ )?a:has\(> img\[data-scale-context="medium"\]:only-child\),\s*(?:[.\w-]+ )?a:has\(> img\[data-scale-context="preview"\]:only-child\))\s*\{([^}]*)\}/)
  return m && { selectors: m[1].replace(/\.component-content /g, '').replace(/\s+/g, ' '), body: m[2].replace(/\s+/g, ' ').trim() }
}

test('#233: dashboard and capture preview carry the identical stacking rule', () => {
  assert.deepEqual(stackRule(dashboard), stackRule(content))
})

for (const [name, css] of [['dashboard', dashboard], ['capture preview', content]]) {
  test(`#233: the ${name} stacks a link that holds only a medium/preview picture on its own line`, () => {
    const rule = stackRule(css)
    assert.ok(rule, 'stacking rule missing or not a live (uncommented) rule')
    assert.equal(rule.body, 'display: block;')
  })

  test(`#233: the ${name} stacking rule never touches thumbnail/small/icon pictures (side-by-side rows keep their layout)`, () => {
    for (const tier of ['thumbnail', 'small', 'icon']) {
      assert.equal(css.includes(`a:has(> img[data-scale-context="${tier}"]`), false)
    }
  })
}
