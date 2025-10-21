import http from 'node:http'

const data = JSON.stringify({ message: 'smoke' })

const options = {
  hostname: 'localhost',
  port: 8001,
  path: '/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}

const req = http.request(options, (res) => {
  let body = ''
  res.on('data', (c) => body += c)
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error('bad status', res.statusCode, body)
      process.exit(2)
    }
    console.log('ok', body)
    process.exit(0)
  })
})

req.on('error', (e) => { console.error(e); process.exit(2) })
req.write(data)
req.end()
