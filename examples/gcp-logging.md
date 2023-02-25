# GCP Logging Example

Code to send logs to GCP logging without using their package (because google one uses nodejs packages).

```ts
const serviceAccount = {
  "type": "service_account",
  "project_id": "xxx",
  "private_key_id": "xxx",
  "private_key": "xxx",
  "client_email": "xxx",
  "client_id": "xxx",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "xxx"
}

const pemHeader = '-----BEGIN PRIVATE KEY-----'
const pemFooter = '-----END PRIVATE KEY-----'

const pem = serviceAccount.private_key.replace(/\n/g, '')
if (!pem.startsWith(pemHeader) || !pem.endsWith(pemFooter)) {
  throw new Error('Invalid service account private key')
}

const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length)

const buffer = Base64.toUint8Array(pemContents)

const algorithm = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: {
    name: 'SHA-256',
  }
}

const privateKey = await crypto.subtle.importKey('pkcs8', buffer, algorithm, false, ['sign'])

const header = Base64.encodeURI(
  JSON.stringify({
    alg: 'RS256',
    typ: 'JWT',
    kid: serviceAccount.private_key_id,
  }),
)

const iat = Math.floor(Date.now() / 1000)
const exp = iat + 3600

const payload = Base64.encodeURI(
  JSON.stringify({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://logging.googleapis.com/',
    exp,
    iat
  })
)

const textEncoder = new TextEncoder()
const inputArrayBuffer = textEncoder.encode(`${header}.${payload}`)

const outputArrayBuffer = await crypto.subtle.sign(
  { name: 'RSASSA-PKCS1-v1_5' },
  privateKey,
  inputArrayBuffer
)

const signature = Base64.fromUint8Array(new Uint8Array(outputArrayBuffer), true)

const token = `${header}.${payload}.${signature}`

const res = await fetch(
  "https://logging.googleapis.com/v2/entries:write",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      logName: `projects/${serviceAccount.project_id}/logs/cloudflareloggingtest`,
      resource: {
        type: "global", // https://cloud.google.com/logging/docs/api/v2/resource-list
        labels: {
          "resource_label_A": "this a resource label"
        }
      },
      labels: {
        "label_A": "a content"
      },
      entries: [
        {
          severity: "info",
          jsonPayload: {
            message: "This is a test message",
            other: "this is somethign else"
          }
        }
      ],
      dryRun: true
    })
  }
)

```
