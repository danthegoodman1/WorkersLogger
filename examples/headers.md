```ts
const logger = new WorkersLogger({
  withMeta: {
    url: request.url,
    headers: Object.fromEntries(Array.from(request.headers.entries()).map(([key, val]) => {
      if (key.toLowerCase() === "authorization") {
        val = "REDACTED"
      }
      return [key, val]
    })),
    method: request.method
  },
  // ...
})
```
