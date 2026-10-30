// Link prefix for files in the archive, such as archive:meetings/2025_05_Meta_USA/agenda.pdf
export const archiveScheme = 'archive:';

/** Return the R2 object key of an archive link, such as meetings/2025_05_Meta_USA/agenda.pdf. */
export function archiveKey(url) {
  return url.slice(archiveScheme.length).replace(/^\/+/, '').split('/').map(decodeURIComponent).join('/');
}

/** Return the public URL of an R2 object key. */
export function archiveFileUrl(archiveUrl, key) {
  return `${archiveUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** Rewrite archive links to the archive base URL. */
export default function rewriteArchiveUrls({ archiveUrl }) {
  return (tree) => {
    const visit = (node) => {
      if (node.type === 'link' && node.url.startsWith(archiveScheme)) {
        node.url = archiveFileUrl(archiveUrl, archiveKey(node.url));
      }
      node.children?.forEach(visit);
    };

    visit(tree);
  };
}
