// The site footer, on the start screen and every page but the game. One constant, so the
// maker's link can later point at the tools hub; the static pages get the same markup at build time.

export const FOOTER = {
  /** Only the name is a link. */
  maker: { name: 'Kieron', url: 'https://github.com/roff-dev' },
  links: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'About', href: '/about' },
    { label: 'Credits', href: '/credits' },
  ],
} as const;

/** Styled by `.site-footer` in base.css. The page links come first, on the left, as on my other sites. */
export function footerHtml(): string {
  const links = FOOTER.links.map(({ label, href }) => `<li><a href="${href}">${label}</a></li>`).join('');
  return (
    `<footer class="site-footer">` +
    `<nav aria-label="Site"><ul>${links}</ul></nav>` +
    `<p>Made by <a href="${FOOTER.maker.url}" rel="author">${FOOTER.maker.name}</a></p>` +
    `</footer>`
  );
}
