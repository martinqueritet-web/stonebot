import { INGREDIENTS, byId } from '../content/ingredients.js';

const pad = (n) => String(n).padStart(2, '0');

/** Side panel with the full story of one ingredient. */
export class Detail {
  constructor(root, { onClose, onNavigate }) {
    this.root = root;
    this.onClose = onClose;
    this.onNavigate = onNavigate;
    this.id = null;
    root.innerHTML = `
      <div class="detail__inner">
        <div class="detail__top">
          <span class="detail__index"></span>
          <button type="button" class="detail__close" aria-label="Fermer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <p class="detail__tag"></p>
        <h2 class="detail__name"></h2>
        <p class="detail__desc"></p>
        <dl class="detail__facts"></dl>
        <div class="detail__nav">
          <button type="button" class="detail__prev"><span aria-hidden="true">↑</span> <span class="detail__prev-name"></span></button>
          <button type="button" class="detail__next"><span class="detail__next-name"></span> <span aria-hidden="true">↓</span></button>
        </div>
      </div>`;
    this.$ = (s) => root.querySelector(s);
    this.$('.detail__close').addEventListener('click', () => onClose());
    this.$('.detail__prev').addEventListener('click', () => this.step(-1));
    this.$('.detail__next').addEventListener('click', () => this.step(1));
    window.addEventListener('keydown', (e) => {
      if (!this.id) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
    });
  }

  step(dir) {
    const i = INGREDIENTS.findIndex((it) => it.id === this.id);
    const next = INGREDIENTS[(i + dir + INGREDIENTS.length) % INGREDIENTS.length];
    this.onNavigate(next.id);
  }

  open(id) {
    const it = byId[id];
    if (!it) return;
    const swap = () => {
      this.id = id;
      this.$('.detail__index').textContent = `${pad(it.index)} / ${pad(INGREDIENTS.length)}`;
      this.$('.detail__tag').textContent = it.tagline;
      this.$('.detail__name').textContent = it.name;
      this.$('.detail__desc').textContent = it.description;
      this.$('.detail__facts').innerHTML = it.facts
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
        .join('');
      const i = it.index - 1;
      const prev = INGREDIENTS[(i - 1 + INGREDIENTS.length) % INGREDIENTS.length];
      const next = INGREDIENTS[(i + 1) % INGREDIENTS.length];
      this.$('.detail__prev-name').textContent = prev.name;
      this.$('.detail__next-name').textContent = next.name;
      this.root.classList.remove('is-swapping');
    };
    if (this.id && this.id !== id) {
      this.root.classList.add('is-swapping');
      setTimeout(swap, 180);
    } else {
      swap();
    }
    this.root.classList.add('is-open');
    this.root.setAttribute('aria-hidden', 'false');
  }

  close() {
    this.id = null;
    this.root.classList.remove('is-open');
    this.root.setAttribute('aria-hidden', 'true');
  }
}
