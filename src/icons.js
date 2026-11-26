// Tiny pixel-art icons as inline SVG (crisp at any integer scale).
const svg = (w, h, body, cls = '') =>
  `<svg class="px-icon ${cls}" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  coin: svg(
    7,
    7,
    '<path fill="#1a1426" d="M2 0h3v1H2zM1 1h1v1H1zM5 1h1v1H5zM0 2h1v3H0zM6 2h1v3H6zM1 5h1v1H1zM5 5h1v1H5zM2 6h3v1H2z"/>' +
      '<path fill="#ffd166" d="M2 1h3v1H2zM1 2h5v3H1zM2 5h3v1H2z"/><path fill="#e0a83a" d="M3 2h1v3H3z"/>',
    'coin',
  ),
  flame: svg(
    7,
    8,
    '<path fill="#ff4f5e" d="M3 0h1v1H3zM2 1h2v1H2zM2 2h3v1H2zM1 3h5v1H1zM0 4h7v3H0zM1 7h5v1H1z"/>' +
      '<path fill="#ffd166" d="M3 3h1v1H3zM2 4h3v2H2zM3 6h1v1H3z"/>',
    'flame',
  ),
  star: svg(
    7,
    7,
    '<path fill="#ffd166" d="M3 0h1v2H3zM0 2h7v1H0zM1 3h5v1H1zM2 4h3v1H2zM1 5h2v1H1zM4 5h2v1H4zM0 6h2v1H0zM5 6h2v1H5z"/>',
    'star',
  ),
  play: svg(6, 7, '<path fill="currentColor" d="M0 0h2v7H0zM2 1h2v5H2zM4 2h1v3H4zM5 3h1v1H5z"/>', 'play'),
  lock: svg(
    7,
    8,
    '<path fill="#1a1426" d="M2 0h3v1H2zM1 1h1v3H1zM5 1h1v3H5zM0 3h7v5H0z"/><path fill="#ffd166" d="M3 5h1v2H3z"/>',
    'lock',
  ),
  starEmpty: svg(
    7,
    7,
    '<path fill="#5a4f6e" d="M3 0h1v2H3zM0 2h7v1H0zM1 3h5v1H1zM2 4h3v1H2zM1 5h2v1H1zM4 5h2v1H4zM0 6h2v1H0zM5 6h2v1H5z"/>',
    'star empty',
  ),
};

export const stars = (n, of = 3) => ICONS.star.repeat(n) + ICONS.starEmpty.repeat(of - n);
