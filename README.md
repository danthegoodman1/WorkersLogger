# WorkersLogger

An optimized logger for Cloudflare Workers.

This allows you to capture full logs in cloudflare workers (no 150 char line limit) without slowing down your workers or having to setup a HTTP worker for HTTP logpush jobs (to proxy because of their test request).

Used in production at [Tangia](www.tangia.co).

## Install

```
npm i cfworkerslogger
```

## Console Logging

Logging to console (optional) can be done either as JSON or as standard `console.x` parameter flattening. See the `consoleJSON` constructor option.

## With Meta

An object that will be included in all `log.meta` lines. You can use this function to provide a common ID to all log lines, for example give all `line.meta` some common UUID, or attach a `RayID`.

Anything you provide in the individual log call's `.meta` will override anything in the `options.withMeta` object

### Usage

```js
// Create a common UUID for all log lines of this run
const logger = new WorkersLogger({
  withMeta: {
    traceID: crypto.uuid()
  }
})
```

```js
// Add the Cloudflare `RayID` to all log lines
const logger = new WorkersLogger({
  withMeta: {
    RayID: request.headers.get("cf-ray")
  }
})
```

```js
// Override something in the log line
const logger = new WorkersLogger({
  withMeta: {
    AThing: "a"
  }
})
logger.info("this see a", {
  SomethingEntirelyDifferent: "b"
})
logger.info("this will overwrite", {
  AThing: "c"
})

// Cloudflare log view:
// ["INFO", "this see a", "AThing", "a", "SomethingEntirelyDifferent", "b"]
// ["INFO", "this will overwrite", "AThing", "c"]
```

## Destination Function

You may optionally provide a destination function that will bulk-write to a sink. Combined with `(event|ctx).waitUntil()` you can have this run after the response is written.

### Usage

```js

```
