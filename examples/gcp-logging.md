# GCP Logging Example

Code to send logs to GCP logging without using their package (because google one uses nodejs packages).

Credit to https://hookdeck.com/blog/post/how-to-call-google-cloud-apis-from-cloudflare-workers for the direct google api trickery.

```ts
const logger = new WorkerLogger({
  level: "DEBUG",
  levelKey: "severity",
  withMeta: {
    rayID: request.headers.get("cf-ray")
  },
  destinationFunction: (lines, httpLog) => {
    const sa = JSON.parse(env.ServiceAccount) as ServiceAccount

    const pemHeader = "-----BEGIN PRIVATE KEY-----"
    const pemFooter = "-----END PRIVATE KEY-----"

    const pem = sa.private_key.replace(/\n/g, "")
    if (!pem.startsWith(pemHeader) || !pem.endsWith(pemFooter)) {
      throw new Error("Invalid service account private key")
    }

    const pemContents = pem.substring(
      pemHeader.length,
      pem.length - pemFooter.length
    )

    const buffer = Base64.toUint8Array(pemContents)

    const algorithm = {
      name: "RSASSA-PKCS1-v1_5",
      hash: {
        name: "SHA-256",
      },
    }

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      buffer,
      algorithm,
      false,
      ["sign"]
    )

    const header = Base64.encodeURI(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
        kid: sa.private_key_id,
      })
    )

    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 3600

    const payload = Base64.encodeURI(
      JSON.stringify({
        iss: sa.client_email,
        sub: sa.client_email,
        aud: "https://logging.googleapis.com/",
        exp,
        iat,
      })
    )

    const textEncoder = new TextEncoder()
    const inputArrayBuffer = textEncoder.encode(`${header}.${payload}`)

    const outputArrayBuffer = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      privateKey,
      inputArrayBuffer
    )

    const signature = Base64.fromUint8Array(
      new Uint8Array(outputArrayBuffer),
      true
    )

    const token = `${header}.${payload}.${signature}`

    const entries: any[] = []
    entries.push(...lines.map((line) => {
      return {
        severity: line.level,
        jsonPayload: {
          message: line.message,
          ...line.meta
        }
      }
    }))

    if (httpLog) {
      entries.push({
        severity: (() => {
          if (httpLog.response.statusCode < 300) {
            return "INFO"
          } else if (httpLog.response.statusCode >= 400 && httpLog.response.statusCode < 500) {
            return "WARN"
          } else if (httpLog.response.statusCode >= 500) {
            return "ERROR"
          } else {
            return "DEFAULT"
          }
        })(),
        httpRequest: {
          requestMethod: log.Event.Request!.Method,
          requestUrl: log.Event.Request!.URL,
          status: log.Event.Response?.Status
        },
        labels: {
          rayID: lines[0].meta.rayID
        },
      })
    }

    const res = await fetch(
      "https://logging.googleapis.com/v2/entries:write",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          logName: `projects/${sa.project_id}/logs/your_worker`,
          resource: {
            type: "global", // https://cloud.google.com/logging/docs/api/v2/resource-list
            labels: { // can't put extra labels on global resource...
              // resource_label_A: "this a resource label",
            },
          },
          labels: {
            worker: "your_worker",
          },
          entries,
            // dryRun: true
        }),
      }
    )
    console.log("Response from google", res.status)
  },
})
```
