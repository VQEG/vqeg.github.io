# Editing VQEG website content

## Pages

Each page of the website is an MDX file in `src/data/page/`. The file path is the URL: `src/data/page/projects/example.mdx` is published at `/projects/example`.

A file starts with a short metadata block, followed by the page text in Markdown:

```mdx
---
title: 'Example page'
---

## First section

Write the page here.
```

Use headings, paragraphs, links and bulleted lists for normal edits. Some files also have a `source` line in the metadata block. Leave it unchanged: it names the page of the old vqeg.org that the file came from.

To publish a change, commit it to the `master` branch, for example with the edit button on GitHub. The site is rebuilt and online a few minutes later.

## Archive lists

On the Meetings and the Publications and Software pages, each level-3 heading with a bulleted list below it becomes a collapsed section. To add a meeting, add a heading and a list of file links. Do not write HTML for the collapsed sections.

Meeting headings start with year and month, such as `### 2026_05_AGH_Poland`. The heading is also the folder name of the meeting in the archive. Meetings are shown newest first.

## Meeting and publication files

Meeting files are not stored in this repository. They are in the VQEG file archive on Cloudflare R2. Link to a file in the archive with `archive:` and the path of the file:

```md
### 2026_05_AGH_Poland

- [agenda.pdf](archive:meetings/2026_05_AGH_Poland/agenda.pdf) (0.2 MB)
- [Welcome slides.pptx](archive:meetings/2026_05_AGH_Poland/Welcome%20slides.pptx) (3.1 MB)
```

In the link, write a space as `%20`, `(` as `%28` and `)` as `%29`. The link text in square brackets can have normal spaces.

The file has to be in the archive before the link works. Uploading needs access to the VQEG Cloudflare account; ask one of its administrators (Werner, Kjell or Ioannis). The [README](README.md#meeting-and-publication-files) describes the upload.

## Images and small downloads

Images and small files are in `public/media/`. Refer to an image as `/media/folder/filename.jpg`. Do not put meeting files there.
