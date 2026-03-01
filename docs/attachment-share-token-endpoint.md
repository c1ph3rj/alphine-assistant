# Attachment Share Token Endpoint

This frontend now supports expiring attachment URLs for provider calls when
`VITE_APPWRITE_ATTACHMENT_TOKEN_ENDPOINT` is configured.

## Request

`POST <VITE_APPWRITE_ATTACHMENT_TOKEN_ENDPOINT>`

```json
{
  "bucketId": "chat-attachments",
  "fileIds": ["fileA", "fileB"],
  "ttlSeconds": 600
}
```

## Response

Return one of these shapes (both are accepted):

```json
{
  "items": [
    {
      "fileId": "fileA",
      "url": "https://.../storage/buckets/.../files/fileA/view?token=...",
      "expiresAt": "2026-03-01T12:00:00.000Z"
    }
  ]
}
```

or

```json
{
  "tokens": [
    {
      "resourceId": "fileA",
      "viewUrl": "https://.../storage/buckets/.../files/fileA/view?token=...",
      "expire": "2026-03-01T12:00:00.000Z"
    }
  ]
}
```

## Appwrite Function Example (Node.js)

Requires API key scopes:
- `tokens.write`
- `files.read`

```js
import sdk from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  try {
    const body = JSON.parse(req.body || '{}');
    const bucketId = String(body.bucketId || '').trim();
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.map(String) : [];
    const ttlSeconds = Math.max(60, Number.parseInt(String(body.ttlSeconds ?? '600'), 10) || 600);

    if (!bucketId || !fileIds.length) {
      return res.json({ items: [] }, 200);
    }

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const tokens = new sdk.Tokens(client);
    const storage = new sdk.Storage(client);

    const expire = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const items = [];

    for (const fileId of fileIds) {
      const token = await tokens.createFileToken(bucketId, fileId, expire);
      const url = storage.getFileView(bucketId, fileId, token.secret);
      items.push({
        fileId,
        url,
        expiresAt: token.expire,
      });
    }

    return res.json({ items }, 200);
  } catch (err) {
    error(String(err));
    return res.json({ items: [] }, 500);
  }
};
```
