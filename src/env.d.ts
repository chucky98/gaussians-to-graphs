/// <reference types="astro/client" />

// svelte-check does not understand .astro files; `astro check` resolves the real types
// (a specific file always wins over this wildcard there).
declare module '*.astro' {
  const Component: (props: Record<string, unknown>) => unknown;
  export default Component;
}
