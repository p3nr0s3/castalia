const http = require('http');

// Test GET
const reqGet = http.request({
  host: '127.0.0.1',
  port: 9876,
  path: '/',
  method: 'GET',
  timeout: 3000
}, (res) => {
  let body = '';
  res.on('data', (d) => body += d);
  res.on('end', () => console.log('GET Response:', res.statusCode, body));
});
reqGet.on('error', (e) => console.log('GET Error:', e.message));
reqGet.end();

// Test POST
const payload = JSON.stringify({ code: "import bpy\nbpy.ops.mesh.primitive_cylinder_add(radius=1, depth=2, location=(0,0,1))\nprint('Cylinder added successfully!')" });
const reqPost = http.request({
  host: '127.0.0.1',
  port: 9876,
  path: '/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  },
  timeout: 3000
}, (res) => {
  let body = '';
  res.on('data', (d) => body += d);
  res.on('end', () => console.log('POST Response:', res.statusCode, body));
});
reqPost.on('error', (e) => console.log('POST Error:', e.message));
reqPost.write(payload);
reqPost.end();
