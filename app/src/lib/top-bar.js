// @ts-check
// The top app bar of a page without a band takes the « on scroll » colour once its page's
// content is scrolled (theme.css, .od-navbar-scrolled; task 2026-11-13-114). One listener for
// the whole app: scroll events of every .page-content, caught on the way down.

/** @param {Event} e */
function onScroll(e) {
  const content = e.target;
  if (!(content instanceof HTMLElement) || !content.classList.contains('page-content')) return;
  const bar = content.closest('.page')?.querySelector(':scope > .navbar');
  bar?.classList.toggle('od-navbar-scrolled', content.scrollTop > 0);
}

export function enableTopBarScroll() {
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
}
