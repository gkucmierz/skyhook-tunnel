import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGateway } from '../src/gateway.js';

test('resolveGateway defaults to remote deploy (skyhook.7u.pl) with TLS', () => {
  const res = resolveGateway(['34430']);
  assert.equal(res.serverHost, 'skyhook.7u.pl');
  assert.equal(res.isLocalhost, false);
  assert.equal(res.isSecure, true);
  assert.equal(res.targetEnvironment, 'remote');
});

test('resolveGateway handles --dev and --local flags', () => {
  const resDev = resolveGateway(['34430', '--dev']);
  assert.equal(resDev.serverHost, 'localhost:17356');
  assert.equal(resDev.isLocalhost, true);
  assert.equal(resDev.isSecure, false);
  assert.equal(resDev.targetEnvironment, 'dev');

  const resLocal = resolveGateway(['34430', '--local']);
  assert.equal(resLocal.serverHost, 'localhost:17356');
  assert.equal(resLocal.isLocalhost, true);
  assert.equal(resLocal.isSecure, false);
  assert.equal(resLocal.targetEnvironment, 'dev');
});

test('resolveGateway handles -s dev and -s local shorthand', () => {
  const resDev = resolveGateway(['34430', '-s', 'dev']);
  assert.equal(resDev.serverHost, 'localhost:17356');
  assert.equal(resDev.isLocalhost, true);
  assert.equal(resDev.isSecure, false);
  assert.equal(resDev.targetEnvironment, 'dev');

  const resLocal = resolveGateway(['34430', '--server', 'local']);
  assert.equal(resLocal.serverHost, 'localhost:17356');
  assert.equal(resLocal.isLocalhost, true);
  assert.equal(resLocal.isSecure, false);
  assert.equal(resLocal.targetEnvironment, 'dev');
});

test('resolveGateway rewrites UI dev server port 34430 to Go gateway port 17356', () => {
  const resUrl = resolveGateway(['34430', '-s', 'http://localhost:34430/']);
  assert.equal(resUrl.serverHost, 'localhost:17356');
  assert.equal(resUrl.isLocalhost, true);
  assert.equal(resUrl.isSecure, false);
  assert.equal(resUrl.targetEnvironment, 'dev');

  const resHost = resolveGateway(['34430', '-s', 'localhost:34430']);
  assert.equal(resHost.serverHost, 'localhost:17356');
  assert.equal(resHost.isLocalhost, true);
  assert.equal(resHost.isSecure, false);
  assert.equal(resHost.targetEnvironment, 'dev');
});

test('resolveGateway handles direct localhost:17356 gateway URL', () => {
  const res = resolveGateway(['34430', '-s', 'http://localhost:17356']);
  assert.equal(res.serverHost, 'localhost:17356');
  assert.equal(res.isLocalhost, true);
  assert.equal(res.isSecure, false);
  assert.equal(res.targetEnvironment, 'dev');
});

test('resolveGateway handles --remote, --prod, and -s remote shorthand', () => {
  const resRemote = resolveGateway(['34430', '--remote']);
  assert.equal(resRemote.serverHost, 'skyhook.7u.pl');
  assert.equal(resRemote.isLocalhost, false);
  assert.equal(resRemote.isSecure, true);
  assert.equal(resRemote.targetEnvironment, 'remote');

  const resProd = resolveGateway(['34430', '--prod']);
  assert.equal(resProd.serverHost, 'skyhook.7u.pl');
  assert.equal(resProd.isLocalhost, false);
  assert.equal(resProd.isSecure, true);
  assert.equal(resProd.targetEnvironment, 'remote');

  const resFlag = resolveGateway(['34430', '-s', 'remote']);
  assert.equal(resFlag.serverHost, 'skyhook.7u.pl');
  assert.equal(resFlag.isLocalhost, false);
  assert.equal(resFlag.isSecure, true);
  assert.equal(resFlag.targetEnvironment, 'remote');
});

test('resolveGateway handles explicit full URL for remote deploy', () => {
  const res = resolveGateway(['34430', '-s', 'https://skyhook.7u.pl/']);
  assert.equal(res.serverHost, 'skyhook.7u.pl');
  assert.equal(res.isLocalhost, false);
  assert.equal(res.isSecure, true);
  assert.equal(res.targetEnvironment, 'remote');
});

test('resolveGateway handles custom hosts with optional TLS overrides', () => {
  const resCustom = resolveGateway(['3000', '-s', 'gateway.internal:8080']);
  assert.equal(resCustom.serverHost, 'gateway.internal:8080');
  assert.equal(resCustom.isLocalhost, false);
  assert.equal(resCustom.isSecure, true);
  assert.equal(resCustom.targetEnvironment, 'custom');

  const resNoTls = resolveGateway(['3000', '-s', 'gateway.internal:8080', '--no-tls']);
  assert.equal(resNoTls.isSecure, false);

  const resTls = resolveGateway(['3000', '--dev', '--tls']);
  assert.equal(resTls.isSecure, true);
});
