'use strict';

const http = require('node:http');
const net = require('node:net');
const { readRuntime } = require('./config');

function request(runtime, pathname, { method = 'GET', timeoutMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port: runtime.port,
      path: pathname,
      method,
      headers: { 'X-Open-Clowk-Token': runtime.token },
      timeout: timeoutMs,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Monitor returned HTTP ${response.statusCode}.`));
          return;
        }
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(new Error(`Monitor returned invalid JSON: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Monitor request timed out.')));
    request.on('error', reject);
    request.end();
  });
}

async function monitorStatus(options = {}) {
  const runtime = readRuntime(options);
  if (!runtime?.port || !runtime?.token) return { running: false, runtime };
  try {
    const health = await request(runtime, '/health');
    return { running: true, runtime, health };
  } catch (error) {
    return { running: false, runtime, error: error.message };
  }
}

function portRefused(port, { timeoutMs = 1000, connectFn = net.connect } = {}) {
  return new Promise((resolve) => {
    if (!Number.isInteger(port) || port <= 0) {
      resolve(false);
      return;
    }
    const socket = connectFn({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (refused) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(refused);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(false));
    socket.once('timeout', () => finish(false));
    socket.once('error', (error) => finish(error.code === 'ECONNREFUSED'));
  });
}

async function stopMonitorRequest(options = {}) {
  const status = await monitorStatus(options);
  if (!status.running) return false;
  await request(status.runtime, '/control/stop', { method: 'POST' });
  return true;
}

module.exports = { monitorStatus, portRefused, request, stopMonitorRequest };
