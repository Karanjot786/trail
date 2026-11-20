// Markdown twin of every docs page, at /docs/<page>.md
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export async function getStaticPaths() {
  const docs = await getCollection('docs');
  return docs.map((d) => ({ params: { slug: d.id.replace(/^docs\//, '') }, props: { d } }));
}

export const GET: APIRoute = ({ props }) => {
  const { d } = props as { d: Awaited<ReturnType<typeof getCollection<'docs'>>>[number] };
  const body = `# ${d.data.title}\n\n${d.data.description ? d.data.description + '\n\n' : ''}${d.body ?? ''}`;
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
