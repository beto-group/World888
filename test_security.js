const http = require('http');
const assert = require('assert');
const { EventEmitter } = require('events');

// Keep track of the request handler
let handler = null;

// Mock http.createServer to capture the handler and bypass TCP binding
http.createServer = function(h) {
  handler = h;
  const mockServer = new EventEmitter();
  mockServer.listen = function(port, host, cb) {
    if (cb) process.nextTick(cb);
    return mockServer;
  };
  mockServer.close = function(cb) {
    if (cb) process.nextTick(cb);
  };
  return mockServer;
};

// Require server script
const serverModule = require('./server/world888-server.js');

// Start the server (assets folder path doesn't matter for routing tests)
serverModule.start(__dirname + '/assets');

// Helper to construct mock Request
function createMockRequest(method, path, headers = {}, remoteAddress = '127.0.0.1') {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  req.headers = headers;
  req.socket = { remoteAddress };
  return req;
}

// Helper to construct mock Response
function createMockResponse(callback) {
  const res = {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      Object.assign(this.headers, headers);
    },
    write(chunk) {
      this.body += chunk.toString();
    },
    end(chunk) {
      if (chunk) this.body += chunk.toString();
      if (callback) callback(this);
    }
  };
  return res;
}

// Run the tests
async function runTests() {
  console.log('🧪 Starting Security & Authorization Unit Tests...');

  // Get the passcode from players module state if possible, or extract from console output
  // Since we require it, let's see: how do we get the passcode?
  // We can read it from the file since it generates on load. But we can also retrieve it
  // by calling /status endpoint!
  let passcode = null;
  const statusReq = createMockRequest('GET', '/status', {}, '127.0.0.1');
  const statusRes = createMockResponse((res) => {
    const data = JSON.parse(res.body);
    passcode = data.passcode;
    console.log(`ℹ️ Retrieved generated passcode for testing: ${passcode}`);
  });
  handler(statusReq, statusRes);

  assert(passcode !== null, 'Passcode should be discoverable locally');

  // Test 1: POST /sync from localhost should succeed without passcode
  await new Promise((resolve) => {
    const req = createMockRequest('POST', '/sync', { 'content-type': 'application/json' }, '127.0.0.1');
    const res = createMockResponse((response) => {
      assert.strictEqual(response.statusCode, 200);
      assert(JSON.parse(response.body).ok);
      console.log('✅ Test 1 Passed: Local sync authorized without passcode.');
      resolve();
    });
    handler(req, res);
    req.emit('data', JSON.stringify({ id: 'player1', name: 'LocalPlayer' }));
    req.emit('end');
  });

  // Test 2: POST /sync from LAN remote IP should fail without passcode
  await new Promise((resolve) => {
    const req = createMockRequest('POST', '/sync', { 'content-type': 'application/json' }, '192.168.1.15');
    const res = createMockResponse((response) => {
      assert.strictEqual(response.statusCode, 401);
      assert.strictEqual(response.body, 'Unauthorized');
      console.log('✅ Test 2 Passed: LAN sync rejected without passcode.');
      resolve();
    });
    handler(req, res);
    req.emit('data', JSON.stringify({ id: 'player2', name: 'RemotePlayer' }));
    req.emit('end');
  });

  // Test 3: POST /sync from LAN remote IP with correct passcode in header should succeed
  await new Promise((resolve) => {
    const req = createMockRequest(
      'POST',
      '/sync',
      { 'content-type': 'application/json', 'x-passcode': passcode },
      '192.168.1.15'
    );
    const res = createMockResponse((response) => {
      assert.strictEqual(response.statusCode, 200);
      assert(JSON.parse(response.body).ok);
      console.log('✅ Test 3 Passed: LAN sync authorized with correct passcode.');
      resolve();
    });
    handler(req, res);
    req.emit('data', JSON.stringify({ id: 'player2', name: 'RemotePlayer' }));
    req.emit('end');
  });

  // Test 4: POST /kill from remote IP should fail (even with passcode)
  await new Promise((resolve) => {
    const req = createMockRequest('POST', '/kill', { 'x-passcode': passcode }, '192.168.1.15');
    const res = createMockResponse((response) => {
      assert.strictEqual(response.statusCode, 403);
      assert.strictEqual(response.body, 'Forbidden - Admin commands restricted to localhost');
      console.log('✅ Test 4 Passed: Remote /kill request rejected.');
      resolve();
    });
    handler(req, res);
  });

  // Test 5: /status endpoint from remote IP should hide passcode
  await new Promise((resolve) => {
    const req = createMockRequest('GET', '/status', {}, '192.168.1.15');
    const res = createMockResponse((response) => {
      assert.strictEqual(response.statusCode, 200);
      const data = JSON.parse(response.body);
      assert.strictEqual(data.passcode, undefined);
      console.log('✅ Test 5 Passed: Remote status check hides passcode.');
      resolve();
    });
    handler(req, res);
  });

  console.log('\n🎉 All Security & LAN Authentication Tests Passed Successfully!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
