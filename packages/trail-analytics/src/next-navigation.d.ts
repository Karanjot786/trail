// Minimal ambient types so the package builds without installing next.
declare module 'next/navigation.js' {
  export function usePathname(): string;
  export function useParams(): Record<string, string | string[]> | null;
}
