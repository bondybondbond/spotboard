// ═══════════════════════════════════════════════════════════════
// ONBOARDING GUIDED TOUR — Shadow DOM coach card
// Extracted from content.ts — all onboarding UI and state lives here.
// Hard requirement: Shadow DOM isolates coach card from host-page
// CSS on BBC News / NPR / Amazon (z-index, fonts, box-model).
// All assets inline — no external URLs (blocked by host-page CSP).
// ═══════════════════════════════════════════════════════════════

import { fireConfetti } from './utils/confetti';

// ── State ──────────────────────────────────────────────────────
const SANDBOX_URL_PATTERN = 'bondybondbond.github.io/spotboard/sandbox.html';
const _isPlaygroundPage = window.location.href.includes(SANDBOX_URL_PATTERN);

let _isOnboardingMode = sessionStorage.getItem('sb_onboarding') === '1'
  && sessionStorage.getItem('sb_onboarding_url') === window.location.pathname;

let _coachShadow: ShadowRoot | null = null;
let _coachHost: HTMLElement | null = null;
let _toggleCapture: ((forceState?: boolean) => void) | null = null;

// ── Public accessors ───────────────────────────────────────────
export function getIsPlaygroundPage(): boolean { return _isPlaygroundPage; }
export function getIsOnboardingMode(): boolean { return _isOnboardingMode; }

// ── Internal helpers ───────────────────────────────────────────
function _clearOnboardingState() {
  sessionStorage.removeItem('sb_onboarding');
  sessionStorage.removeItem('sb_onboarding_url');
  _isOnboardingMode = false;
  if (_coachHost) { _coachHost.remove(); _coachHost = null; _coachShadow = null; }
}

function setCoachStep(n: number | null) {
  if (!_coachShadow) return;
  _coachShadow.querySelectorAll('.coach-card')
    .forEach(c => (c as HTMLElement).classList.remove('visible'));
  const arrow = _coachShadow.querySelector('#sb-toolbar-arrow') as HTMLElement | null;
  if (arrow) arrow.classList.toggle('visible', n === 1);
  if (n !== null) _coachShadow.querySelector(`#sb-card-step${n}`)?.classList.add('visible');
}

function injectOnboardingCoach() {
  if (_coachHost) return; // already injected
  const host = document.createElement('div');
  host.id = 'sb-coach-host';
  host.setAttribute('data-spotboard-ignore', 'true'); // prevent accidental capture
  host.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483646;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  _coachShadow = shadow;
  _coachHost = host;

  const style = document.createElement('style');
  style.textContent = [
    '.coach-card{position:fixed;top:80px;right:20px;width:360px;background:#1c1c1e;color:#f5f5f7;border:none;',
    'border-radius:14px;padding:20px;',
    'box-shadow:0 8px 32px rgba(0,0,0,.35),0 0 0 2px #fff;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
    'font-size:14px;line-height:1.5;display:none;pointer-events:auto;}',
    '.coach-card.visible{display:block;animation:coach-glow 2.5s ease-in-out infinite;}',
    '@keyframes coach-glow{',
    '0%,100%{box-shadow:0 8px 32px rgba(0,0,0,.35),0 0 0 2px #fff;}',
    '50%{box-shadow:0 8px 32px rgba(0,0,0,.35),0 0 0 2px #fff,0 0 0 5px rgba(102,126,234,.55);}}',
    '#sb-card-step1{top:auto;bottom:120px;right:20px;}',
    '.pos-left{top:50%;left:20px;right:auto;bottom:auto;transform:translateY(-50%);}',
    '.coach-step-pill{display:inline-block;background:#6d28d9;color:#fff;font-size:11px;font-weight:600;',
    'padding:2px 10px;border-radius:20px;margin-bottom:10px;letter-spacing:.02em;}',
    '.coach-title{font-size:16px;font-weight:700;margin-bottom:8px;}',
    '.coach-body{color:#d1d1d6;margin-bottom:8px;}',
    '.coach-tip{font-size:12px;color:#8e8e93;margin-top:8px;}',
    '.completion-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);pointer-events:auto;}',
    '.completion-backdrop.visible{display:block;}',
    '.coach-card.completion{top:50%;left:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);',
    'text-align:center;width:320px;animation:none;}',
    '.coach-celebration{font-size:48px;margin-bottom:12px;}',
    '.coach-open-board{display:block;width:100%;margin-top:16px;padding:12px 20px;background:#6d28d9;',
    'color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;pointer-events:auto;}',
    '.coach-open-board:hover{background:#5b21b6;}',
    '#sb-toolbar-arrow{position:fixed;top:16px;right:100px;text-align:right;',
    'background:#fff;border:2px solid #1a1a1a;border-radius:12px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,.15);opacity:0;transform:translateY(6px);transition:opacity .4s ease,transform .4s ease;pointer-events:none;}',
    '#sb-toolbar-arrow.visible{opacity:1;transform:translateY(0);}',
    '#sb-toolbar-arrow svg{width:52px;height:52px;',
    'filter:drop-shadow(0 0 10px rgba(102,126,234,.85));',
    'animation:float-arrow 1.5s ease-in-out infinite;margin-left:auto;display:block;}',
    '.arrow-label{font-size:14px;font-weight:700;color:#1a1a1a;margin-top:2px;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    '.arrow-hint{font-size:11px;color:#444;max-width:210px;margin-left:auto;margin-top:2px;',
    'line-height:1.4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    '@keyframes float-arrow{0%,100%{transform:translateY(0);}50%{transform:translateY(-9px);}}'
  ].join('');
  shadow.appendChild(style);

  // Floating arrow — shown only on Step 1 (via setCoachStep)
  const arrow = document.createElement('div');
  arrow.id = 'sb-toolbar-arrow';
  const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrowSvg.setAttribute('viewBox', '0 0 52 52');
  arrowSvg.setAttribute('fill', 'none');
  const _p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  _p1.setAttribute('d', 'M26 46V10');
  _p1.setAttribute('stroke', '#667eea');
  _p1.setAttribute('stroke-width', '5');
  _p1.setAttribute('stroke-linecap', 'round');
  const _p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  _p2.setAttribute('d', 'M12 24L26 6L40 24');
  _p2.setAttribute('stroke', '#667eea');
  _p2.setAttribute('stroke-width', '5');
  _p2.setAttribute('stroke-linecap', 'round');
  _p2.setAttribute('stroke-linejoin', 'round');
  arrowSvg.appendChild(_p1);
  arrowSvg.appendChild(_p2);
  const arrowLabel = document.createElement('div');
  arrowLabel.className = 'arrow-label';
  arrowLabel.textContent = 'Click the SpotBoard icon';
  const arrowHint = document.createElement('div');
  arrowHint.className = 'arrow-hint';
  arrowHint.textContent = "Don\u2019t see it? Click the \uD83E\uDDE9 puzzle piece first, then pin SpotBoard";
  arrow.appendChild(arrowSvg);
  arrow.appendChild(arrowLabel);
  arrow.appendChild(arrowHint);
  shadow.appendChild(arrow);

  function _makeCard(id: string, step: string, title: string, body: string, tip?: string): HTMLElement {
    const card = document.createElement('div');
    card.id = id;
    card.className = 'coach-card';
    const pill = document.createElement('div');
    pill.className = 'coach-step-pill';
    pill.textContent = step;
    const titleEl = document.createElement('div');
    titleEl.className = 'coach-title';
    titleEl.textContent = title;
    const bodyEl = document.createElement('div');
    bodyEl.className = 'coach-body';
    bodyEl.textContent = body;
    card.appendChild(pill);
    card.appendChild(titleEl);
    card.appendChild(bodyEl);
    if (tip) {
      const tipEl = document.createElement('div');
      tipEl.className = 'coach-tip';
      tipEl.textContent = tip;
      card.appendChild(tipEl);
    }
    return card;
  }

  shadow.appendChild(_makeCard('sb-card-step1', 'Step 1 of 3', 'Open SpotBoard',
    'Look for the \uD83E\uDDE9 puzzle piece in your toolbar \u2192 click SpotBoard \u2192 click Save a Spot.',
    '\uD83D\uDCA1 Tip: Pin SpotBoard for easier access!'));
  shadow.appendChild(_makeCard('sb-card-step2', 'Step 2 of 3', 'Select a section',
    'A red frame appears as you move your cursor. Click any block of content.'));
  const card3 = _makeCard('sb-card-step3', 'Step 3 of 3', 'Confirm your capture',
    'A green frame marks your selection. Press Confirm Spot to save it.');
  card3.classList.add('pos-left');
  shadow.appendChild(card3);

  const backdrop = document.createElement('div');
  backdrop.id = 'sb-completion-backdrop';
  backdrop.className = 'completion-backdrop';
  shadow.appendChild(backdrop);

  const cardC = document.createElement('div');
  cardC.id = 'sb-card-completion';
  cardC.className = 'coach-card completion';
  const celDiv = document.createElement('div');
  celDiv.className = 'coach-celebration';
  celDiv.textContent = '\uD83C\uDF89';
  const titleC = document.createElement('div');
  titleC.className = 'coach-title';
  titleC.textContent = 'You did it!';
  const bodyC = document.createElement('div');
  bodyC.className = 'coach-body';
  bodyC.textContent = 'Your first spot is saved and will stay updated automatically.';
  const openBtn = document.createElement('button');
  openBtn.id = 'sb-open-board';
  openBtn.className = 'coach-open-board';
  openBtn.textContent = '\u2192 Go to SpotBoard';
  openBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'focusDashboard' }, (response) => {
      if (!response?.found) chrome.runtime.sendMessage({ action: 'openDashboard' });
    });
  });
  const closeX = document.createElement('button');
  closeX.setAttribute('aria-label', 'Dismiss');
  closeX.textContent = '\u2715';
  closeX.style.cssText = 'position:absolute;top:10px;right:12px;background:none;border:none;cursor:pointer;font-size:18px;color:#8e8e93;line-height:1;padding:4px;pointer-events:auto;';
  closeX.addEventListener('click', () => {
    console.debug('[sb-onboarding] close X clicked — dismissing completion overlay');
    (_coachShadow?.querySelector('#sb-completion-backdrop') as HTMLElement | null)?.classList.remove('visible');
    (_coachShadow?.querySelector('#sb-card-completion') as HTMLElement | null)?.classList.remove('visible');
  });
  cardC.appendChild(celDiv);
  cardC.appendChild(titleC);
  cardC.appendChild(bodyC);
  cardC.appendChild(openBtn);
  cardC.appendChild(closeX);
  shadow.appendChild(cardC);

  document.body.appendChild(host);
  setCoachStep(1);
}

// ── Public: advance coach through stages ───────────────────────
export function advanceOnboardingCoach(stage: 'capturing' | 'selected' | 'completed') {
  if (!_coachShadow) return;
  if (stage === 'capturing') {
    setCoachStep(2);
    fireConfetti(40);
  } else if (stage === 'selected') {
    setCoachStep(3);
    fireConfetti(10);
  } else if (stage === 'completed') {
    const host = document.getElementById('sb-coach-host') as HTMLElement | null;

    // Diagnostic log — keep for debugging
    console.debug('[sb-coach] completion: re-appending host to end of body. Last child was:',
      document.body.lastElementChild?.id);

    // Dynamic re-append: guarantees host is last sibling, wins DOM-order tie at equal z-index
    if (host) {
      document.body.appendChild(host); // detach + reattach at end
      host.style.zIndex = '2147483647';
      console.debug('[sb-coach] host re-appended. body.lastElementChild is now:', document.body.lastElementChild?.id);
    }

    _toggleCapture?.(false); // close capture overlays before showing completion
    setCoachStep(null);
    (_coachShadow.querySelector('#sb-completion-backdrop') as HTMLElement)?.classList.add('visible');
    (_coachShadow.querySelector('#sb-card-completion') as HTMLElement)?.classList.add('visible');
    fireConfetti(150);
    chrome.storage.local.set({ onboardingCompleted: true });
    sessionStorage.removeItem('sb_onboarding');
    sessionStorage.removeItem('sb_onboarding_url');
  }
}

// ── Initialization ─────────────────────────────────────────────
// Called once from content.ts. Stores toggleCapture reference for later use
// (avoids circular import — toggleCapture is only called on user action,
// not during init, so all content.ts state is fully initialized by then).
export function initOnboarding(deps: { toggleCapture: (forceState?: boolean) => void }) {
  _toggleCapture = deps.toggleCapture;

  // Inject onboarding beacon on playground page (observed by sandbox.html MutationObserver)
  if (_isPlaygroundPage) {
    const beacon = document.createElement('div');
    beacon.id = 'sb-onboarding-beacon';
    beacon.dataset.stage = 'ready';
    beacon.dataset.version = '1';
    beacon.dataset.dashboardUrl = chrome.runtime.getURL('dashboard.html') + '?from=playground';
    beacon.style.display = 'none';
    // Append to body (not documentElement) so sandbox.html's body MutationObserver can detect it
    (document.body || document.documentElement).appendChild(beacon);

    // Watch for actions from sandbox page (e.g. "open-dashboard")
    // Sandbox page can't call chrome.runtime.sendMessage (web context), so it sets
    // data-action on the beacon and we relay it from the extension context.
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-action' && beacon.dataset.action === 'open-dashboard') {
          beacon.dataset.action = ''; // consume
          chrome.runtime.sendMessage({ action: 'focusDashboard' }, (response) => {
            if (!response || !response.found) {
              chrome.runtime.sendMessage({ action: 'openDashboard' });
            }
          });
        }
      }
    }).observe(beacon, { attributes: true, attributeFilter: ['data-action'] });
  }

  // Onboarding guided tour — ?spotboard_onboarding=1 param detection
  // sessionStorage persists across hard refresh / tab restore
  const _onboardingParam = new URLSearchParams(window.location.search).get('spotboard_onboarding');
  if (_onboardingParam === '1') {
    sessionStorage.setItem('sb_onboarding', '1');
    sessionStorage.setItem('sb_onboarding_url', window.location.pathname);
    _isOnboardingMode = true;
    try {
      const _cleanUrl = new URL(window.location.href);
      _cleanUrl.searchParams.delete('spotboard_onboarding');
      history.replaceState(null, '', _cleanUrl.toString());
    } catch (_e) { /* non-fatal */ }
  }

  // Separate block — fires on hard refresh too (URL param gone but sessionStorage still set)
  if (_isOnboardingMode) {
    const _doInjectCoach = () => injectOnboardingCoach();
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      _doInjectCoach();
    } else {
      window.addEventListener('DOMContentLoaded', _doInjectCoach);
    }
  }

  // Check for pending onboarding trigger from dashboard info modal (tabId pull model)
  // Content script asks background worker if this tab should start onboarding.
  // Pull architecture: content script is alive when it asks, so no message-channel race condition.
  chrome.runtime.sendMessage({ type: 'CHECK_ONBOARDING' }, (shouldStart: boolean) => {
    if (chrome.runtime.lastError) return; // no extension context (e.g. incognito)
    if (!shouldStart) return;
    if (document.getElementById('sb-coach-host')) return; // idempotency guard
    console.debug('[sb-onboarding] CHECK_ONBOARDING → true on', window.location.hostname);
    _isOnboardingMode = true;
    const _doInject = () => injectOnboardingCoach();
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      _doInject();
    } else {
      window.addEventListener('DOMContentLoaded', _doInject);
    }
  });
}
