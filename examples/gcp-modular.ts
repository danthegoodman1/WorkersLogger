import { HTTPLog, LogLine } from "cfworkerslogger"
import { Base64 } from "js-base64"
import { Env } from "./types/env"

export class RetryableFetchTimeout extends Error {
  cause?: Error
  constructor (opts?: { cause?: any }) {
    super("Retryable fetch timed out after back-off")
    this.cause = opts?.cause
  }
}

/**
 * Will retry fetch on non-4XX errors until a specified number of exponential back-off steps,
 * each increasing the back-off by some number of milliseconds.
 */
export async function RetryableFetch(input: RequestInfo, init?: RequestInit<RequestInitCfProperties> | undefined, backoffConfig: { steps: number, stepMS: number } = {stepMS: 50, steps: 10}): Promise<Response> {
  try {
    let res: Response

    for (let i = 0; i < backoffConfig.steps; i++) {
      if (i > 0) {
        console.log(`sleeping ${i*backoffConfig.stepMS}ms then retrying request`)
        // Save some cycle avoiding this the first time even though it's 0
        await new Promise((resolve) => setTimeout(resolve, i*backoffConfig.stepMS))
      }

      try {
        res = await fetch(input, init)
        if (res.status < 500) {
          return res
        }
      } catch (error) {
        console.error("Error fetching:", error)
        if (i === backoffConfig.steps-1) {
          // Last one, throw the error
          throw new RetryableFetchTimeout({ cause: error })
        }
      }
    }

    return res!
  } catch (error) {
    console.error("error handling retryable fetch", error)
    throw error
  }
}

/**
 * Will retry fetch on non-4XX errors until a specified number of exponential back-off steps,
 * each increasing the back-off by some number of milliseconds.
 */
export async function DurableObjectRetryableFetch(stub: DurableObjectStub, input: RequestInfo, init?: RequestInit<RequestInitCfProperties> | undefined, backoffConfig: { steps: number, stepMS: number } = {stepMS: 50, steps: 10}): Promise<Response> {
  let res: Response

  for (let i = 0; i < backoffConfig.steps; i++) {
    if (i > 0) {
      console.log(`sleeping ${i*backoffConfig.stepMS}ms then retrying request`)
      // Save some cycle avoiding this the first time even though it's 0
      await new Promise((resolve) => setTimeout(resolve, i*backoffConfig.stepMS))
    }

    try {
      res = await stub.fetch(input, init)
      if (res.status < 500) {
        return res
      }
    } catch (error) {
      console.error("Error fetching:", error)
      if (i === backoffConfig.steps-1) {
        // Last one, throw the error
        throw new RetryableFetchTimeout({ cause: error })
      }
    }
  }

  return res!
}

export interface ServiceAccount {
  "type": string
  "project_id": string
  "private_key_id": string
  "private_key": string
  "client_email": string
  "client_id": string
  "auth_uri": string
  "token_uri": string
  "auth_provider_x509_cert_url": string
  "client_x509_cert_url": string
}

export async function googleDestinationFunction(lines: LogLine[], env: Env, httpLog?: HTTPLog) {
  const serviceAccount = JSON.parse(env.ServiceAccount) as ServiceAccount

  const pemHeader = "-----BEGIN PRIVATE KEY-----"
  const pemFooter = "-----END PRIVATE KEY-----"

  const pem = serviceAccount.private_key.replace(/\n/g, "")
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
      kid: serviceAccount.private_key_id,
    })
  )

  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600

  const payload = Base64.encodeURI(
    JSON.stringify({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
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
      labels: {
        rayID: line.meta?.rayID,
        test: "hey"
      },
      jsonPayload: {
        message: line.message,
        ...line.meta
      }
    }
  }))

  if (httpLog) {
    if (httpLog.request.headers["authorization"])
      httpLog.request.headers["authorization"] = "REDACTED"
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
        requestMethod: httpLog.request.method,
        requestUrl: httpLog.request.url,
        status: httpLog.response.statusCode,
        requestSize: Number(httpLog.request.headers["content-length"]),
        remoteIp: httpLog.request.headers["x-real-ip"],
        userAgent: httpLog.request.headers["user-agent"]
      },
      labels: {
        rayID: lines[0].meta?.rayID
      },
      jsonPayload: {
        headers: httpLog.request.headers
      }
    })
  }

  const res = await RetryableFetch(
    "https://logging.googleapis.com/v2/entries:write",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        logName: `projects/${serviceAccount.project_id}/logs/your_logname`,
        resource: {
          type: "global", // https://cloud.google.com/logging/docs/api/v2/resource-list
          labels: { // can't put extra labels on global resource...
            // resource_label_A: "this a resource label",
          },
        },
        labels: {
          worker: "your_wowrker-Name",
        },
        entries,
          // dryRun: true
      }),
    }
  )
  console.log("Response from google", res.status)
  if (res.status > 299) {
    console.log(await res.text())
  }
}
