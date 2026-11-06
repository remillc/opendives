// @ts-check
// Width decides the layout, not the type of device (spec, section 3): below
// 768 px, phone layout. A foldable therefore changes layout without restarting.

const query = typeof matchMedia === 'function' ? matchMedia('(max-width: 767.98px)') : null;

export const layout = $state({ phone: query ? query.matches : true });

query?.addEventListener('change', (e) => {
  layout.phone = e.matches;
});
