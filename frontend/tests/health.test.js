import http from 'node:http'

const options = { hostname: 'localhost', port: 8001, path: '/health', method: 'GET' }

const req = http.request(options, (res) => {
  console.log('statusCode:', res.statusCode)
  if (res.statusCode !== 200) process.exit(2)
  res.on('data', () => {})
  res.on('end', () => process.exit(0))
})

req.on('error', (e) => { console.error(e); process.exit(2) })
req.end()
