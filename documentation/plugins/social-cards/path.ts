/**
 * Where a blog post's card lives, relative to the site root and without the
 * base URL: /blog/hello-world becomes img/og/blog/hello-world.png. Shared by
 * the plugin that writes the cards and the page metadata that links them.
 */
export function cardPath(permalink: string, baseUrl: string): string {
  const route = permalink.startsWith(baseUrl) ? permalink.slice(baseUrl.length) : permalink.replace(/^\//, "");
  return `img/og/${route.replace(/\/$/, "")}.png`;
}
