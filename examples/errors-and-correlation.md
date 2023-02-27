```ts
const reqID = crypto.randomUUID()
const logger = new WorkersLogger({
  withMeta: {
    reqID // all logs will have this
  }
})
let res: Response | Promise<Response>
// Default response is internal error
// You can attach some request ID here as well 
res = new Response("internal error", {
  status: 500
})
try {
  // ... your code
  res = new Response() // successful response
} catch (error) {
  // Cloudflare likes to hide the real error in Error.cause which won't log in a console.error(error)
  logger.error("error handling request", {
    err: Object.fromEntries(Object.getOwnPropertyNames(error).map((prop) => [prop, (error as any)[prop]])) // this will make an object of all key-value pairs in the error class
  })
} finally {
  ctx.waitUntil(logger.Drain())
  res.headers.set("req-id", reqID) // correlate to the client
  return res
}
```
