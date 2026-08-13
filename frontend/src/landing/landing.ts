import './landing.css';

type TickerItem = {
  invoice: string;
  status: string;
  amount: string;
  meta: string;
};

const TICKER_ITEMS: TickerItem[] = [
  { invoice: 'INV-1042', status: 'Registered', amount: '12,400 tNight', meta: '0x91f3…4a7c' },
  { invoice: 'INV-1042', status: 'Buyer-verified', amount: '12,400 tNight', meta: '0x91f3…4a7c' },
  { invoice: 'INV-1038', status: 'Sealed bid', amount: '8,950 tNight', meta: '3 commitments' },
  { invoice: 'INV-1031', status: 'Lowest-rate bid revealed', amount: '400 bps (4.00%)', meta: '0x2b19…c8f1' },
  { invoice: 'INV-1027', status: 'Settled', amount: '21,600 tNight', meta: 'lowest rate paid' },
  { invoice: 'INV-1044', status: 'Registered', amount: '3,200 tNight', meta: '0x7a05…e2d4' },
  { invoice: 'INV-1035', status: 'Buyer-verified', amount: '6,750 tNight', meta: '0x4c88…9f3b' },
  { invoice: 'INV-1029', status: 'Settled', amount: '9,100 tNight', meta: 'lowest rate paid' },
];

function renderTicker(): void {
  const track = document.getElementById('ticker-track');
  if (!track) return;

  const render = (items: TickerItem[]): string =>
    items
      .map(
        (item) => `
      <span class="ticker-item">
        <span class="ticker-status">${item.status}</span>
        <span class="t-mono">${item.invoice}</span>
        <span class="ticker-amount">${item.amount}</span>
        <span class="ticker-meta">${item.meta}</span>
      </span>`,
      )
      .join('');

  // Two copies of the list produce a seamless -50% translateX marquee loop.
  track.innerHTML = render(TICKER_ITEMS) + render(TICKER_ITEMS);
}

function pseudoCommitment(score: number, threshold: number): string {
  const seed = `${score}:${threshold}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `0x${(hash >>> 0).toString(16).padStart(8, '0')}${(hash >>> 8).toString(16).slice(0, 4)}`;
}

function initZkDemo(): void {
  const scoreEl = document.getElementById('zk-score') as HTMLInputElement | null;
  const thresholdEl = document.getElementById('zk-threshold') as HTMLInputElement | null;
  const resultEl = document.getElementById('zk-result');
  if (!scoreEl || !thresholdEl || !resultEl) return;

  const clamp = (value: number): number => Math.min(850, Math.max(300, Math.round(value)));

  const update = (): void => {
    const score = clamp(Number(scoreEl.value) || 0);
    const threshold = clamp(Number(thresholdEl.value) || 0);
    const proven = score >= threshold;

    resultEl.className = `zk-result ${proven ? 'proven' : 'denied'}`;
    if (proven) {
      resultEl.innerHTML = `
        <strong>Proven: credit ≥ ${threshold} ✓</strong>
        <span class="zk-proof-line">The score itself never leaves this browser — lenders only ever see this bound.</span>
        <span class="zk-proof-line">Simulated on-chain commitment: ${pseudoCommitment(score, threshold)}</span>`;
    } else {
      resultEl.innerHTML = `
        <strong>Cannot prove credit ≥ ${threshold}</strong>
        <span class="zk-proof-line">A score of ${score} is below the threshold — the proof would fail.</span>`;
    }
  };

  scoreEl.addEventListener('input', update);
  thresholdEl.addEventListener('input', update);
  update();
}

function initNav(): void {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  links.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).tagName === 'A') {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  const sections = Array.from(document.querySelectorAll<HTMLElement>('main section[id]'));
  const navAnchors = Array.from(links.querySelectorAll<HTMLAnchorElement>('a'));
  const visible = (el: HTMLElement): boolean => {
    const rect = el.getBoundingClientRect();
    return rect.top <= window.innerHeight * 0.4 && rect.bottom >= 0;
  };

  const onScroll = (): void => {
    const current = sections.find(visible);
    navAnchors.forEach((a) => {
      const on = current && a.getAttribute('href') === `#${current.id}`;
      a.classList.toggle('nav-active', Boolean(on));
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

renderTicker();
initZkDemo();
initNav();
