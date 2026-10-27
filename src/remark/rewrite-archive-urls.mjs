// Old Umbraco download link for a meeting or publication file
export const archiveLinkPrefix = 'https://vqeg.org/umbraco/surface/FolderList/GetFile?';

// Archive page and key prefix in R2
export const archivePages = {
  'meetings.mdx': 'meetings',
  'publications-and-software.mdx': 'publications',
};

/**
 * Split a query string without decoding "+" as a space.
 * Some file names contain a literal "+", which the old server reads as a space.
 */
export function parseQuery(url) {
  const query = url.slice(url.indexOf('?') + 1);
  return Object.fromEntries(
    query.split('&').map((pair) => {
      const index = pair.indexOf('=');
      return index < 0 ? [pair, ''] : [pair.slice(0, index), decodeURIComponent(pair.slice(index + 1))];
    })
  );
}

/** Return the R2 object key of an old download link, or null if the link has no complete file name. */
export function archiveKey(url, prefix) {
  const { directory, filename, pageId } = parseQuery(url);
  if (!directory || !filename || !pageId) return null;
  return `${prefix}/${directory}/${filename}`;
}

/** Rewrite old download links on the archive pages to the archive base URL. */
export default function rewriteArchiveUrls({ archiveUrl }) {
  const base = archiveUrl.replace(/\/$/, '');

  return (tree, file) => {
    const prefix = archivePages[file.path?.split('/').pop()];
    if (!prefix) return;

    const visit = (node) => {
      if (node.type === 'link' && node.url.startsWith(archiveLinkPrefix)) {
        const key = archiveKey(node.url, prefix);
        if (key) node.url = `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
      }
      node.children?.forEach(visit);
    };

    visit(tree);
  };
}
