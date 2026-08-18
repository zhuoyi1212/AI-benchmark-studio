-- Keep the private benchmark artifact bucket aligned with the multimodal upload types.

update storage.buckets
set allowed_mime_types = array[
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'video/mp4',
  'video/webm',
  'video/quicktime'
]::text[]
where id = 'benchmark-artifacts';
